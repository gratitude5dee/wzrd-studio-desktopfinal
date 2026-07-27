-- Persist per-shot generation attempts and media-specific errors for resumable storyboard batches.

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS image_generation_error TEXT,
  ADD COLUMN IF NOT EXISTS video_generation_error TEXT,
  ADD COLUMN IF NOT EXISTS image_generation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_generation_attempts INTEGER NOT NULL DEFAULT 0;

DO $$
DECLARE
  existing_video_status_constraint TEXT;
BEGIN
  FOR existing_video_status_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.shots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%video_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS %I', existing_video_status_constraint);
  END LOOP;

  ALTER TABLE public.shots
    ADD CONSTRAINT shots_video_status_check
    CHECK (video_status IS NULL OR video_status IN ('pending', 'queued', 'generating', 'completed', 'failed'));

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.shots'::regclass
      AND conname = 'shots_image_generation_attempts_nonnegative'
  ) THEN
    ALTER TABLE public.shots
      ADD CONSTRAINT shots_image_generation_attempts_nonnegative
      CHECK (image_generation_attempts >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.shots'::regclass
      AND conname = 'shots_video_generation_attempts_nonnegative'
  ) THEN
    ALTER TABLE public.shots
      ADD CONSTRAINT shots_video_generation_attempts_nonnegative
      CHECK (video_generation_attempts >= 0);
  END IF;
END $$;

UPDATE public.shots
SET image_generation_error = failure_reason
WHERE image_status = 'failed'
  AND image_generation_error IS NULL
  AND failure_reason IS NOT NULL;

UPDATE public.shots
SET video_generation_error = failure_reason
WHERE video_status = 'failed'
  AND video_generation_error IS NULL
  AND failure_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shots_project_generation_failures
  ON public.shots(project_id, scene_id, shot_number)
  WHERE image_status = 'failed' OR video_status = 'failed';

COMMENT ON COLUMN public.shots.image_generation_error IS 'Last image-generation error for the storyboard shot.';
COMMENT ON COLUMN public.shots.video_generation_error IS 'Last video-generation error for the storyboard shot.';
COMMENT ON COLUMN public.shots.image_generation_attempts IS 'Number of image-generation attempts for the storyboard shot.';
COMMENT ON COLUMN public.shots.video_generation_attempts IS 'Number of video-generation attempts for the storyboard shot.';

NOTIFY pgrst, 'reload schema';
