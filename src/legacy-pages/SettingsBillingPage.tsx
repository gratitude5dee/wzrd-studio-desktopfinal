import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Coins,
  Crown,
  FileText,
  LifeBuoy,
  Loader2,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useBilling, type BillingCreditPack, type BillingPlan } from '@/hooks/useBilling';
import { useCredits } from '@/hooks/useCredits';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { appRoutes } from '@/lib/routes';
import { Bar, BarChart, type ChartConfig, XAxis } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';

const creditsChartConfig: ChartConfig = {
  credits: { label: 'Credits', color: ditherColors.primary },
};

/* ------------------------------------------------------------------ */
/*  Fallback data (used when billing-catalog returns empty)            */
/* ------------------------------------------------------------------ */

const FALLBACK_PLANS: BillingPlan[] = [
  { plan_code: 'free', display_name: 'Free', description: 'One-time 100-credit welcome grant.', monthly_price_cents: 0, yearly_price_cents: null, monthly_quota: 0, rollover_cap: 0 },
  { plan_code: 'pro', display_name: 'Pro', description: 'For independent creators and small teams.', monthly_price_cents: 4900, yearly_price_cents: null, monthly_quota: 2000, rollover_cap: 2000 },
  { plan_code: 'business', display_name: 'Business', description: 'For larger teams with heavier generation volume.', monthly_price_cents: 14900, yearly_price_cents: null, monthly_quota: 10000, rollover_cap: 10000 },
  { plan_code: 'enterprise', display_name: 'Enterprise', description: 'Custom billing, governance, and support.', monthly_price_cents: 0, yearly_price_cents: null, monthly_quota: 0, rollover_cap: 0 },
];

const FALLBACK_PACKS: BillingCreditPack[] = [
  { pack_code: 'pack_500', display_name: '500 Credits', credits: 500, price_cents: 5000 },
  { pack_code: 'pack_2000', display_name: '2,000 Credits', credits: 2000, price_cents: 18000 },
  { pack_code: 'pack_5000', display_name: '5,000 Credits', credits: 5000, price_cents: 40000 },
];

const PLAN_FEATURES: Record<string, string[]> = {
  free: ['100 welcome credits', 'All generative tools', 'Community support'],
  pro: ['2,000 monthly credits', '2,000 rollover cap', 'Priority generation queue', 'Advanced models', 'Project sharing'],
  business: ['10,000 monthly credits', '10,000 rollover cap', 'Everything in Pro', 'Team seats', 'Priority support', 'Custom workflows'],
  enterprise: ['Custom credit quota', 'Dedicated support', 'SSO & governance', 'Custom invoicing'],
};

const BEST_VALUE_PACK = 'pack_2000';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const price = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

const pricePrecise = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

const perCredit = (cents: number, credits: number) =>
  credits > 0 ? pricePrecise(Math.round((cents / credits) * 100) / 100) : '$0.00';

const dateLabel = (value: string | null | undefined) => {
  if (!value) return 'Not scheduled';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Not scheduled' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function hasStripePrice(plan: BillingPlan): boolean {
  return !!plan.stripe_price_monthly_id && !plan.stripe_price_monthly_id.includes('REPLACE');
}

function hasPackStripePrice(pack: BillingCreditPack): boolean {
  return !!pack.stripe_price_id && !pack.stripe_price_id.includes('REPLACE');
}

/* ------------------------------------------------------------------ */
/*  Pack Card (reused in page + modal)                                */
/* ------------------------------------------------------------------ */

function PackCard({
  pack,
  isBestValue,
  onBuy,
  isLoading,
  disabled,
}: {
  pack: BillingCreditPack;
  isBestValue: boolean;
  onBuy: () => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  const configured = hasPackStripePrice(pack);
  return (
    <Card
      className={`relative flex flex-col border p-5 transition-all ${
        isBestValue
          ? 'border-orange-500/60 bg-orange-950/10 shadow-[0_0_30px_-10px_rgba(249,115,22,0.25)]'
          : 'border-zinc-800 bg-zinc-950/50'
      }`}
    >
      {isBestValue && (
        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 border-orange-500/40 bg-orange-500/20 text-orange-300 text-[10px] uppercase tracking-widest">
          Best Value
        </Badge>
      )}
      <div className="mb-4 text-center">
        <p className="text-3xl font-bold">{pack.credits.toLocaleString()}</p>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">credits</p>
      </div>
      <div className="mb-4 text-center">
        <p className="text-2xl font-semibold">{price(pack.price_cents)}</p>
        <p className="text-xs text-zinc-400">{perCredit(pack.price_cents, pack.credits)}/credit</p>
      </div>
      <Button
        className={`mt-auto w-full ${isBestValue ? 'bg-orange-500 text-zinc-950 hover:bg-orange-400' : ''}`}
        onClick={onBuy}
        disabled={disabled || isLoading || !configured}
        aria-label={`Buy ${pack.credits} credits for ${price(pack.price_cents)}`}
      >
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {!configured ? 'Not configured' : isLoading ? 'Redirecting…' : 'Buy'}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Stripe Setup Section (admin — auto-hides when configured)         */
/* ------------------------------------------------------------------ */

function StripeSetupSection({
  plans,
  packs,
  onComplete,
}: {
  plans: BillingPlan[];
  packs: BillingCreditPack[];
  onComplete: () => void;
}) {
  const [isRunning, setIsRunning] = useState(false);

  const needsSetup = useMemo(() => {
    const unconfiguredPlans = plans.filter(
      (p) => (p.plan_code === 'pro' || p.plan_code === 'business') && !hasStripePrice(p),
    );
    const unconfiguredPacks = packs.filter((p) => !hasPackStripePrice(p));
    return unconfiguredPlans.length > 0 || unconfiguredPacks.length > 0;
  }, [plans, packs]);

  const handleSetup = useCallback(async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-setup');
      if (error) {
        toast.error(`Setup failed: ${error.message}`);
        return;
      }
      const results = data?.results || {};
      const created = Object.values(results).filter((r: any) => r.status === 'created').length;
      const skipped = Object.values(results).filter((r: any) => r.status === 'already_configured').length;
      const errors = Object.values(results).filter((r: any) => r.status === 'error').length;

      if (errors > 0) {
        toast.warning(`Setup completed with ${errors} error(s). Check edge function logs.`);
      } else {
        toast.success(`Stripe configured! ${created} created, ${skipped} already set.`);
      }
      onComplete();
    } catch (err) {
      toast.error('Failed to invoke billing-setup function.');
    } finally {
      setIsRunning(false);
    }
  }, [onComplete]);

  if (!needsSetup) return null;

  return (
    <Card className="mb-6 border-amber-500/30 bg-amber-950/10 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold text-amber-200">Stripe Setup Required</h4>
          </div>
          <p className="text-xs text-zinc-400">
            Some plans or credit packs don't have Stripe Price IDs. Click to auto-create Products &amp; Prices in Stripe and link them.
          </p>
        </div>
        <Button
          onClick={handleSetup}
          disabled={isRunning}
          className="bg-amber-500 text-zinc-950 hover:bg-amber-400 shrink-0"
          size="sm"
        >
          {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings className="mr-2 h-4 w-4" />}
          {isRunning ? 'Configuring…' : 'Configure Stripe'}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

const SettingsBillingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isTopUpOpen, setIsTopUpOpen] = useState(searchParams.get('topup') === '1');
  const checkoutHandled = useRef(false);

  const {
    isLoading: billingLoading,
    isCheckoutLoading,
    checkoutLoadingId,
    isPortalLoading,
    billingMode,
    checkoutAvailable,
    plans,
    creditPacks,
    subscription,
    startCheckout,
    openPortal,
    fetchCatalog,
  } = useBilling();
  const { isLoading: creditsLoading, wallet, plan, availableCredits } = useCredits();

  const visiblePlans = plans.length > 0 ? plans : FALLBACK_PLANS;
  const visiblePacks = useMemo(() => {
    const preferred = ['pack_500', 'pack_2000', 'pack_5000'];
    const fromCatalog = creditPacks.filter((p) => preferred.includes(p.pack_code));
    if (fromCatalog.length === 3) return fromCatalog;
    if (creditPacks.length > 0) return creditPacks.slice(0, 3);
    return FALLBACK_PACKS;
  }, [creditPacks]);

  const requiredFromQuery = Number(searchParams.get('required') || 0);
  const availableFromQuery = Number(searchParams.get('available') || 0);

  const walletSummary = useMemo(() => {
    const monthlyQuota = wallet?.monthly_quota ?? plan?.monthly_quota ?? 100;
    const available = wallet?.available_total ?? availableCredits ?? 0;
    const percentage = monthlyQuota > 0
      ? Math.min(100, Math.max(0, (available / monthlyQuota) * 100))
      : available > 0 ? 100 : 0;
    return { monthlyQuota, available, percentage };
  }, [wallet, availableCredits, plan]);

  const creditsChartData = useMemo(
    () => [
      { label: 'Available', credits: Math.max(0, Math.ceil(walletSummary.available)) },
      { label: 'Used', credits: Math.max(0, walletSummary.monthlyQuota - Math.ceil(walletSummary.available)) },
      { label: 'Quota', credits: Math.max(0, walletSummary.monthlyQuota) },
    ],
    [walletSummary]
  );

  const subscriptionPlanCode = subscription?.plan_code || plan?.plan_code || wallet?.plan_code || 'free';
  const renewDate = subscription?.current_period_end || wallet?.reset_at || null;

  /* -- Checkout query param handling -- */
  useEffect(() => {
    if (checkoutHandled.current) return;
    const status = searchParams.get('checkout');
    if (!status) return;
    checkoutHandled.current = true;

    if (status === 'success') {
      toast.success('Payment successful! Your credits have been updated.');
      fetchCatalog();
    } else if (status === 'cancel') {
      toast.info('Checkout was cancelled. No charge was made.');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, fetchCatalog]);

  /* -- Top-up triggers -- */
  useEffect(() => {
    if (searchParams.get('topup') === '1') setIsTopUpOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const handler = () => setIsTopUpOpen(true);
    window.addEventListener('billing:open-topup', handler);
    return () => window.removeEventListener('billing:open-topup', handler);
  }, []);

  const handleCloseModal = (open: boolean) => {
    setIsTopUpOpen(open);
    if (!open && searchParams.get('topup') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('topup');
      next.delete('required');
      next.delete('available');
      setSearchParams(next, { replace: true });
    }
  };

  const handlePackCheckout = async (packCode: string) => {
    const result = await startCheckout({ checkout_mode: 'pack', pack_code: packCode });
    if (!result.success) toast.error(result.message || 'Checkout unavailable');
  };

  const handlePlanCheckout = async (planCode: string) => {
    if (planCode === 'enterprise') {
      toast.info('Contact support for Enterprise onboarding.');
      return;
    }
    const result = await startCheckout({ checkout_mode: 'subscription', plan_code: planCode, interval: 'month' });
    if (!result.success) toast.error(result.message || 'Checkout unavailable');
  };

  const handleOpenPortal = async () => {
    const result = await openPortal();
    if (!result.success) toast.error(result.message || 'Customer portal unavailable');
  };

  /* -- Plan card icon helper -- */
  const planIcon = (code: string) => {
    if (code === 'pro') return <Zap className="h-5 w-5 text-orange-400" />;
    if (code === 'business') return <Crown className="h-5 w-5 text-amber-300" />;
    if (code === 'enterprise') return <Sparkles className="h-5 w-5 text-sky-400" />;
    return <CircleDollarSign className="h-5 w-5 text-zinc-500" />;
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_40%),#09090b] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        {/* ---- Header ---- */}
        <div className="mb-10">
          <Link to={appRoutes.home} className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Studio
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Credits</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {billingMode === 'disabled'
              ? 'Billing is not configured.'
              : billingMode === 'test_only'
              ? 'Test mode — payments are simulated.'
              : 'Manage your plan, credits, and billing.'}
          </p>
        </div>

        {/* ---- Insufficient-credit banner ---- */}
        {requiredFromQuery > 0 && (
          <Card className="mb-6 border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100">
            Insufficient credits. Required: <strong>{Math.ceil(requiredFromQuery)}</strong>. Available: <strong>{Math.ceil(availableFromQuery)}</strong>.
          </Card>
        )}

        {/* ---- Summary Cards ---- */}
        <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Current Plan */}
          <Card className="border-zinc-800/80 bg-zinc-950/70 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Current Plan</p>
                <h2 className="mt-1.5 text-2xl font-bold capitalize">{subscriptionPlanCode as string}</h2>
                <p className="mt-1 text-sm text-zinc-500">Renews {dateLabel(renewDate as string | null)}</p>
              </div>
              {planIcon(subscriptionPlanCode as string)}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800"
                onClick={handleOpenPortal}
                disabled={isPortalLoading || !checkoutAvailable}
              >
                {isPortalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LifeBuoy className="mr-2 h-4 w-4" />}
                Manage Subscription
              </Button>
              {billingMode === 'test_only' && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">TEST MODE</Badge>
              )}
            </div>
          </Card>

          {/* Credits */}
          <Card className="border-zinc-800/80 bg-zinc-950/70 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Credits Remaining</p>
                <h2 className="mt-1.5 text-2xl font-bold">
                  {creditsLoading ? '…' : Math.ceil(walletSummary.available).toLocaleString()}
                </h2>
              </div>
              <Coins className="h-5 w-5 text-amber-300" />
            </div>
            <Progress value={walletSummary.percentage} className="mt-4 mb-2 h-1.5 bg-zinc-800" />
            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span>{Math.ceil(walletSummary.available).toLocaleString()} available</span>
              <span>{walletSummary.monthlyQuota.toLocaleString()} monthly</span>
            </div>
            <BarChart
              data={creditsChartData}
              config={creditsChartConfig}
              bloom={ditherBloom.dashboard}
              className="mt-4 h-28 w-full"
            >
              <Bar dataKey="credits" />
              <XAxis dataKey="label" />
            </BarChart>
            <Button
              className="mt-4 w-full bg-amber-500 text-zinc-950 hover:bg-amber-400 font-medium"
              onClick={() => setIsTopUpOpen(true)}
              disabled={!checkoutAvailable || isCheckoutLoading}
            >
              Top up credits
            </Button>
          </Card>
        </div>

        {/* ---- Plans Section ---- */}
        <section id="plans" className="mb-12">
          <div className="mb-5 flex items-center gap-3">
            <h3 className="text-xl font-semibold">Plans</h3>
            {(billingLoading || creditsLoading) && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {visiblePlans.map((bp) => {
              const isCurrent = bp.plan_code === subscriptionPlanCode;
              const isBusiness = bp.plan_code === 'business';
              const isEnterprise = bp.plan_code === 'enterprise';
              const isFree = bp.plan_code === 'free';
              const configured = hasStripePrice(bp);
              const loading = checkoutLoadingId === bp.plan_code;
              const features = PLAN_FEATURES[bp.plan_code] || [];

              return (
                <Card
                  key={bp.plan_code}
                  className={`relative flex flex-col border p-5 transition-all ${
                    isBusiness
                      ? 'border-orange-500/50 bg-gradient-to-b from-orange-950/20 to-zinc-950/60 shadow-[0_0_40px_-12px_rgba(249,115,22,0.3)]'
                      : isCurrent
                      ? 'border-orange-500/30 bg-zinc-950/60'
                      : 'border-zinc-800 bg-zinc-950/50'
                  }`}
                >
                  {isBusiness && (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 border-orange-500/40 bg-orange-500/20 text-orange-300 text-[10px] uppercase tracking-widest">
                      Recommended
                    </Badge>
                  )}
                  {isCurrent && (
                    <Badge className="absolute right-3 top-3 border-orange-500/30 bg-orange-500/15 text-orange-300 text-[10px] uppercase tracking-widest">
                      Current
                    </Badge>
                  )}

                  <div className="mb-1 flex items-center gap-2">
                    {planIcon(bp.plan_code)}
                    <h4 className="text-lg font-semibold">{bp.display_name}</h4>
                  </div>

                  <p className="mb-4 text-xs text-zinc-400 leading-relaxed">{bp.description}</p>

                  <p className="mb-4 text-3xl font-bold">
                    {isEnterprise ? 'Custom' : isFree ? '$0' : price(bp.monthly_price_cents)}
                    {!isEnterprise && <span className="text-sm font-normal text-zinc-500">/mo</span>}
                  </p>

                  <ul className="mb-5 flex-1 space-y-1.5">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-zinc-400">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`mt-auto w-full ${isBusiness && !isCurrent ? 'bg-orange-500 text-zinc-950 hover:bg-orange-400' : ''}`}
                    variant={isCurrent || isFree ? 'outline' : 'default'}
                    onClick={() => handlePlanCheckout(bp.plan_code)}
                    disabled={isCurrent || isFree || loading || !checkoutAvailable || (!isEnterprise && !configured)}
                    aria-label={isCurrent ? `Current plan: ${bp.display_name}` : `Choose ${bp.display_name} plan`}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEnterprise
                      ? 'Contact Sales'
                      : isCurrent
                      ? 'Current Plan'
                      : isFree
                      ? 'Active'
                      : !configured
                      ? 'Not Configured'
                      : loading
                      ? 'Redirecting…'
                      : 'Upgrade'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ---- Credit Packs Section ---- */}
        <section className="mb-12">
          <h3 className="mb-5 text-xl font-semibold">Credit Packs</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {visiblePacks.map((pack) => (
              <PackCard
                key={pack.pack_code}
                pack={pack}
                isBestValue={pack.pack_code === BEST_VALUE_PACK}
                onBuy={() => handlePackCheckout(pack.pack_code)}
                isLoading={checkoutLoadingId === pack.pack_code}
                disabled={!checkoutAvailable}
              />
            ))}
          </div>
          {!checkoutAvailable && (
            <p className="mt-3 text-xs text-amber-300">Checkout is unavailable in the current billing mode.</p>
          )}
        </section>

        {/* ---- Stripe Setup (admin) ---- */}
        <StripeSetupSection
          plans={visiblePlans}
          packs={visiblePacks}
          onComplete={() => fetchCatalog()}
        />

        {/* ---- Docs footer ---- */}
        <Card className="border-zinc-800/60 bg-zinc-950/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-400">Need help understanding billing modes, webhooks, or checkout?</p>
            <Link to={appRoutes.settings.billingDocs}>
              <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-200">
                <FileText className="mr-2 h-4 w-4" /> Billing Docs
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* ---- Top-up Modal ---- */}
      <Dialog open={isTopUpOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Top up credits</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
            {visiblePacks.map((pack) => (
              <PackCard
                key={pack.pack_code}
                pack={pack}
                isBestValue={pack.pack_code === BEST_VALUE_PACK}
                onBuy={() => handlePackCheckout(pack.pack_code)}
                isLoading={checkoutLoadingId === pack.pack_code}
                disabled={!checkoutAvailable}
              />
            ))}
          </div>
          {!checkoutAvailable && (
            <p className="mt-2 text-xs text-amber-300">Checkout unavailable in current billing mode.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsBillingPage;
