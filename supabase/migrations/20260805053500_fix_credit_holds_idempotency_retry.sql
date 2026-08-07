
-- Fix credit reservation idempotency retries.
--
-- The previous unique index on credit_holds.idempotency_key covered every
-- non-null key regardless of status, while the credits_reserve idempotency
-- short-circuit only matched status = 'held'. Retrying a key whose prior hold
-- was already committed or released skipped the short-circuit and then failed
-- with "duplicate key value violates unique constraint".
--
-- Recreate the index as partial (only active 'held' rows participate) so a
-- settled hold never blocks a fresh reservation, and harden credits_reserve
-- with ON CONFLICT DO NOTHING + re-select so concurrent retries are idempotent.

DROP INDEX IF EXISTS public.idx_credit_holds_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_holds_idempotency
  ON public.credit_holds (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status = 'held';

CREATE OR REPLACE FUNCTION public.credits_reserve(
  resource_type TEXT,
  requested_amount INTEGER,
  reference_type TEXT DEFAULT NULL,
  reference_id TEXT DEFAULT NULL,
  idempotency_key TEXT DEFAULT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID;
  v_total INTEGER;
  v_used INTEGER;
  v_available INTEGER;
  v_hold_id UUID;
  v_existing_hold_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    -- Check metadata for user_id (service-role calls)
    v_user_id := (metadata->>'user_id')::UUID;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  END IF;

  -- Idempotency check: an active hold for this key is returned as-is.
  -- Committed/released holds do not block a fresh reservation.
  IF credits_reserve.idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_hold_id
    FROM public.credit_holds
    WHERE credit_holds.idempotency_key = credits_reserve.idempotency_key
      AND status = 'held';
    IF FOUND THEN
      SELECT GREATEST(COALESCE(uc.total_credits, 0) - COALESCE(uc.used_credits, 0), 0)
      INTO v_available
      FROM public.user_credits uc WHERE uc.user_id = v_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'hold_id', v_existing_hold_id,
        'available_after', COALESCE(v_available, 0)
      );
    END IF;
  END IF;

  -- Lock and check balance
  SELECT total_credits, used_credits
  INTO v_total, v_used
  FROM public.user_credits
  WHERE user_credits.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create credit account
    INSERT INTO public.user_credits (user_id, total_credits, used_credits)
    VALUES (v_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_total := 0;
    v_used := 0;
  END IF;

  v_available := COALESCE(v_total, 0) - COALESCE(v_used, 0);

  IF v_available < requested_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'insufficient_credits',
      'available', v_available,
      'required', requested_amount
    );
  END IF;

  -- Deduct credits
  UPDATE public.user_credits
  SET used_credits = used_credits + requested_amount, updated_at = now()
  WHERE user_credits.user_id = v_user_id;

  -- Create hold record; a concurrent request with the same idempotency key
  -- may have created the active hold first, so tolerate the conflict.
  INSERT INTO public.credit_holds (user_id, amount, resource_type, reference_type, reference_id, idempotency_key, metadata, status)
  VALUES (v_user_id, requested_amount, credits_reserve.resource_type, credits_reserve.reference_type, credits_reserve.reference_id, credits_reserve.idempotency_key, credits_reserve.metadata, 'held')
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'held' DO NOTHING
  RETURNING id INTO v_hold_id;

  IF v_hold_id IS NULL THEN
    -- Lost the race: undo the deduction and return the existing active hold.
    UPDATE public.user_credits
    SET used_credits = GREATEST(used_credits - requested_amount, 0), updated_at = now()
    WHERE user_credits.user_id = v_user_id;

    SELECT id INTO v_existing_hold_id
    FROM public.credit_holds
    WHERE credit_holds.idempotency_key = credits_reserve.idempotency_key
      AND status = 'held';

    IF v_existing_hold_id IS NULL THEN
      RAISE EXCEPTION 'Credit hold conflict could not be resolved for idempotency key %', credits_reserve.idempotency_key;
    END IF;

    SELECT GREATEST(COALESCE(uc.total_credits, 0) - COALESCE(uc.used_credits, 0), 0)
    INTO v_available
    FROM public.user_credits uc WHERE uc.user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'hold_id', v_existing_hold_id,
      'available_after', COALESCE(v_available, 0)
    );
  END IF;

  -- Record transaction
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, resource_type, metadata)
  VALUES (v_user_id, -requested_amount, 'hold', credits_reserve.resource_type,
    jsonb_build_object('hold_id', v_hold_id, 'reference_type', credits_reserve.reference_type, 'reference_id', credits_reserve.reference_id));

  v_available := v_available - requested_amount;

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'available_after', v_available
  );
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
