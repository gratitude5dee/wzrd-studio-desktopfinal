import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { getDesktopBillingReturnUrls, getDesktopDeepLink, openExternalUrl } from '@/lib/desktop';
import { readPublicFlag } from '@/lib/env';

export type BillingMode = 'disabled' | 'test_only' | 'live';

export interface BillingPlan {
  plan_code: string;
  display_name: string;
  description: string | null;
  monthly_price_cents: number;
  yearly_price_cents: number | null;
  monthly_quota: number;
  rollover_cap: number;
  stripe_price_monthly_id?: string | null;
  stripe_price_yearly_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BillingCreditPack {
  pack_code: string;
  display_name: string;
  credits: number;
  price_cents: number;
  stripe_price_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BillingSubscription {
  plan_code: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface BillingCatalogResponse {
  success: boolean;
  billing_mode: BillingMode;
  checkout_available: boolean;
  plans: BillingPlan[];
  credit_packs: BillingCreditPack[];
  subscription: BillingSubscription | null;
  wallet: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
}

interface CheckoutPayload {
  checkout_mode: 'pack' | 'subscription';
  pack_code?: string;
  plan_code?: string;
  interval?: 'month' | 'year';
}

interface CheckoutResult {
  success: boolean;
  checkout_url?: string;
  message?: string;
  checkout_available?: boolean;
}

function parseCatalogResponse(data: unknown): BillingCatalogResponse | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  return {
    success: payload.success === true,
    billing_mode: (payload.billing_mode as BillingMode) || 'test_only',
    checkout_available: payload.checkout_available !== false,
    plans: Array.isArray(payload.plans) ? (payload.plans as BillingPlan[]) : [],
    credit_packs: Array.isArray(payload.credit_packs) ? (payload.credit_packs as BillingCreditPack[]) : [],
    subscription: (payload.subscription as BillingSubscription | null) || null,
    wallet: (payload.wallet as Record<string, unknown> | null) || null,
    plan: (payload.plan as Record<string, unknown> | null) || null,
  };
}

function createTestBillingCatalog(): BillingCatalogResponse {
  return {
    success: true,
    billing_mode: 'test_only',
    checkout_available: false,
    plans: [],
    credit_packs: [],
    subscription: null,
    wallet: null,
    plan: null,
  };
}

export function useBilling() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!user) {
      setCatalog(null);
      setIsLoading(false);
      return null;
    }

    if (readPublicFlag('BYPASS_AUTH_FOR_TESTS', ['VITE_BYPASS_AUTH_FOR_TESTS'])) {
      const testCatalog = createTestBillingCatalog();
      setCatalog(testCatalog);
      setIsLoading(false);
      return testCatalog;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-catalog');
      if (error) {
        throw new Error(error.message || 'Failed to load billing catalog');
      }

      const parsed = parseCatalogResponse(data);
      if (!parsed) {
        throw new Error('Invalid billing catalog response');
      }

      setCatalog(parsed);
      return parsed;
    } catch (error) {
      console.error('Failed to fetch billing catalog', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load billing catalog');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const startCheckout = useCallback(
    async (payload: CheckoutPayload): Promise<CheckoutResult> => {
      if (!user) {
        return { success: false, message: 'Please log in to continue.' };
      }

      const loadingId = payload.pack_code || payload.plan_code || 'checkout';
      setCheckoutLoadingId(loadingId);
      try {
        const { data, error } = await supabase.functions.invoke('billing-checkout', {
          body: {
            ...payload,
            ...getDesktopBillingReturnUrls(),
          },
        });

        if (error) {
          throw new Error(error.message || 'Checkout request failed');
        }

        const parsed = (data || {}) as CheckoutResult;
        if (parsed.success === false || parsed.checkout_available === false) {
          return {
            success: false,
            message: parsed.message || 'Checkout unavailable',
            checkout_available: false,
          };
        }

        if (parsed.checkout_url) {
          await openExternalUrl(parsed.checkout_url);
        }

        return parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Checkout request failed';
        console.error('Checkout start failed', error);
        return { success: false, message };
      } finally {
        setCheckoutLoadingId(null);
      }
    },
    [user]
  );

  const openPortal = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!user) {
      return { success: false, message: 'Please log in to continue.' };
    }

    setIsPortalLoading(true);
    try {
      const returnUrl = getDesktopDeepLink('/billing/success') ?? `${window.location.origin}/settings/billing`;
      const { data, error } = await supabase.functions.invoke('billing-portal', {
        body: { return_url: returnUrl },
      });

      if (error) {
        throw new Error(error.message || 'Failed to open billing portal');
      }

      const payload = (data || {}) as Record<string, unknown>;
      if (payload.success !== true || typeof payload.portal_url !== 'string') {
        return {
          success: false,
          message:
            typeof payload.message === 'string' ? payload.message : 'Customer portal unavailable',
        };
      }

      await openExternalUrl(payload.portal_url);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open customer portal';
      console.error('Billing portal request failed', error);
      return { success: false, message };
    } finally {
      setIsPortalLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return {
    isLoading,
    isCheckoutLoading: checkoutLoadingId !== null,
    checkoutLoadingId,
    isPortalLoading,
    billingMode: catalog?.billing_mode || 'test_only',
    checkoutAvailable: catalog?.checkout_available !== false,
    plans: catalog?.plans || [],
    creditPacks: catalog?.credit_packs || [],
    subscription: catalog?.subscription || null,
    wallet: catalog?.wallet || null,
    plan: catalog?.plan || null,
    fetchCatalog,
    startCheckout,
    openPortal,
  };
}
