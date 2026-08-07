import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/* ---- Mocks ---- */

const mockStartCheckout = vi.fn().mockResolvedValue({ success: true });
const mockFetchCatalog = vi.fn().mockResolvedValue(null);
const mockOpenPortal = vi.fn().mockResolvedValue({ success: true });

const defaultBilling = {
  isLoading: false,
  isCheckoutLoading: false,
  checkoutLoadingId: null,
  isPortalLoading: false,
  billingMode: 'test_only' as const,
  checkoutAvailable: true,
  plans: [
    { plan_code: 'free', display_name: 'Free', description: 'Welcome grant', monthly_price_cents: 0, yearly_price_cents: null, monthly_quota: 0, rollover_cap: 0 },
    { plan_code: 'pro', display_name: 'Pro', description: 'For creators', monthly_price_cents: 4900, yearly_price_cents: null, monthly_quota: 2000, rollover_cap: 2000, stripe_price_monthly_id: 'price_test_pro' },
    { plan_code: 'business', display_name: 'Business', description: 'For teams', monthly_price_cents: 14900, yearly_price_cents: null, monthly_quota: 10000, rollover_cap: 10000, stripe_price_monthly_id: 'price_test_biz' },
    { plan_code: 'enterprise', display_name: 'Enterprise', description: 'Custom', monthly_price_cents: 0, yearly_price_cents: null, monthly_quota: 0, rollover_cap: 0 },
  ],
  creditPacks: [
    { pack_code: 'pack_500', display_name: '500 Credits', credits: 500, price_cents: 5000, stripe_price_id: 'price_test_500' },
    { pack_code: 'pack_2000', display_name: '2,000 Credits', credits: 2000, price_cents: 18000, stripe_price_id: 'price_test_2000' },
    { pack_code: 'pack_5000', display_name: '5,000 Credits', credits: 5000, price_cents: 40000, stripe_price_id: 'price_test_5000' },
  ],
  subscription: null,
  wallet: null,
  plan: null,
  fetchCatalog: mockFetchCatalog,
  startCheckout: mockStartCheckout,
  openPortal: mockOpenPortal,
};

let billingOverrides: Partial<typeof defaultBilling> = {};

vi.mock('@/hooks/useBilling', () => ({
  useBilling: () => ({ ...defaultBilling, ...billingOverrides }),
}));

vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    isLoading: false,
    wallet: { monthly_quota: 2000, available_total: 500, plan_code: 'free', reset_at: null },
    plan: { plan_code: 'free', monthly_quota: 2000 },
    availableCredits: 500,
  }),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

async function renderBilling(route = '/settings/billing') {
  const mod = await import('@/legacy-pages/SettingsBillingPage');
  const Page = mod.default;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Page />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  billingOverrides = {};
});

describe('SettingsBillingPage', () => {
  it('Pro CTA calls subscription checkout with plan_code pro', async () => {
    await renderBilling();
    const btn = screen.getByLabelText('Choose Pro plan');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledWith({
        checkout_mode: 'subscription',
        plan_code: 'pro',
        interval: 'month',
      });
    });
  });

  it('Business CTA calls subscription checkout with plan_code business', async () => {
    await renderBilling();
    const btn = screen.getByLabelText('Choose Business plan');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledWith({
        checkout_mode: 'subscription',
        plan_code: 'business',
        interval: 'month',
      });
    });
  });

  it('Credit pack CTA calls pack checkout with pack_code', async () => {
    await renderBilling();
    const btns = screen.getAllByLabelText(/Buy 2000 credits/i);
    fireEvent.click(btns[0]);
    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledWith({
        checkout_mode: 'pack',
        pack_code: 'pack_2000',
      });
    });
  });

  it('disables checkout buttons when checkoutAvailable is false', async () => {
    billingOverrides = { checkoutAvailable: false };
    await renderBilling();
    const proBtn = screen.getByLabelText('Choose Pro plan');
    expect(proBtn).toBeDisabled();
  });

  it('shows success toast on ?checkout=success', async () => {
    await renderBilling('/settings/billing?checkout=success');
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('successful'));
    });
    expect(mockFetchCatalog).toHaveBeenCalled();
  });

  it('shows info toast on ?checkout=cancel', async () => {
    await renderBilling('/settings/billing?checkout=cancel');
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('cancelled'));
    });
  });

  it('disables current plan button and labels it', async () => {
    billingOverrides = {
      subscription: { plan_code: 'pro', status: 'active', cancel_at_period_end: false, current_period_start: null, current_period_end: null },
    };
    await renderBilling();
    const btn = screen.getByLabelText('Current plan: Pro');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Current Plan');
  });
});
