import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Coins,
  CreditCard,
  LifeBuoy,
  Loader2,
  Pencil,
  User,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { useBilling } from '@/hooks/useBilling';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { appRoutes } from '@/lib/routes';
import { AreaChart } from '@/components/dither-kit/area-chart';
import { Area } from '@/components/dither-kit/area';
import { Grid } from '@/components/dither-kit/grid';
import { XAxis } from '@/components/dither-kit/x-axis';
import { YAxis } from '@/components/dither-kit/y-axis';

const USAGE_DAYS = 14;

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const SettingsPage = () => {
  const { user } = useAuth();
  const { isPortalLoading, checkoutAvailable, openPortal } = useBilling();
  const { isLoading: creditsLoading, wallet, plan, availableCredits } = useCredits();
  const [usageTransactions, setUsageTransactions] = useState<{ amount: number; created_at: string }[]>([]);

  const [username, setUsername] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draftUsername, setDraftUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('username, wallet_address')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setUsername(data?.username ?? null);
        setWalletAddress(data?.wallet_address ?? null);
        setProfileLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUsageTransactions([]);
      return;
    }
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - (USAGE_DAYS - 1));
    windowStart.setHours(0, 0, 0, 0);
    supabase
      .from('credit_transactions')
      .select('amount, created_at')
      .eq('transaction_type', 'usage')
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setUsageTransactions(
          (Array.isArray(data) ? data : []).map((entry) => ({
            amount: Number(entry.amount) || 0,
            created_at: entry.created_at,
          })),
        );
      });
  }, [user]);

  const displayName = username
    || (walletAddress ? truncateAddress(walletAddress) : null)
    || user?.email
    || 'Anonymous';

  const startEditing = () => {
    setDraftUsername(username ?? '');
    setIsEditing(true);
  };

  const saveUsername = async () => {
    if (!user) return;
    const next = draftUsername.trim();
    if (!next) {
      toast.error('Username cannot be empty');
      return;
    }
    setIsSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: next })
      .eq('id', user.id);
    setIsSaving(false);
    if (error) {
      toast.error(`Failed to update username: ${error.message}`);
      return;
    }
    setUsername(next);
    setIsEditing(false);
    toast.success('Username updated');
  };

  const handleOpenPortal = async () => {
    const result = await openPortal();
    if (!result.success) toast.error(result.message || 'Customer portal unavailable');
  };

  const walletSummary = useMemo(() => {
    const monthlyQuota = wallet?.monthly_quota ?? plan?.monthly_quota ?? 100;
    const available = wallet?.available_total ?? availableCredits ?? 0;
    const percentage = monthlyQuota > 0
      ? Math.min(100, Math.max(0, (available / monthlyQuota) * 100))
      : available > 0 ? 100 : 0;
    return { monthlyQuota, available, percentage };
  }, [wallet, availableCredits, plan]);

  const usageData = useMemo(() => {
    const days: { day: string; used: number }[] = [];
    const byDay = new Map<string, number>();
    for (const tx of usageTransactions) {
      if (!tx.created_at) continue;
      const key = localDateKey(new Date(tx.created_at));
      byDay.set(key, (byDay.get(key) ?? 0) + Math.abs(tx.amount));
    }
    for (let i = USAGE_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        used: byDay.get(localDateKey(d)) ?? 0,
      });
    }
    return days;
  }, [usageTransactions]);

  const hasUsage = usageData.some((d) => d.used > 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_40%),#09090b] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        {/* ---- Header ---- */}
        <div className="mb-10">
          <Link to={appRoutes.home} className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Studio
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Manage your profile, usage, and billing.</p>
        </div>

        {/* ---- Profile ---- */}
        <Card className="mb-6 border-zinc-800/80 bg-zinc-950/70 p-6">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Profile</p>
              {profileLoading ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
                </div>
              ) : isEditing ? (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={draftUsername}
                    onChange={(event) => setDraftUsername(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveUsername();
                      if (event.key === 'Escape') setIsEditing(false);
                    }}
                    placeholder="Choose a username"
                    aria-label="Username"
                    className="max-w-xs border-zinc-700 bg-zinc-900/70 text-zinc-100"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => void saveUsername()} disabled={isSaving} aria-label="Save username">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" className="border-zinc-700 bg-zinc-900/70" onClick={() => setIsEditing(false)} aria-label="Cancel editing">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center gap-2">
                  <h2 className="truncate text-2xl font-bold">{displayName}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-zinc-500 hover:text-zinc-200"
                    onClick={startEditing}
                    aria-label="Edit username"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="mt-1 truncate text-sm text-zinc-500">
                {user?.email}
                {walletAddress ? ` · ${truncateAddress(walletAddress)}` : ''}
              </p>
            </div>
            <User className="h-5 w-5 shrink-0 text-zinc-500" />
          </div>
        </Card>

        {/* ---- Credits + Billing ---- */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-950/70 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Billing</p>
                <h2 className="mt-1.5 text-2xl font-bold capitalize">{(plan?.plan_code ?? wallet?.plan_code ?? 'free') as string}</h2>
              </div>
              <CreditCard className="h-5 w-5 text-zinc-500" />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
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
              <Button asChild variant="outline" size="sm" className="border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800">
                <Link to={appRoutes.settings.billing}>Plans &amp; Credits</Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* ---- Usage chart ---- */}
        <Card className="border-zinc-800/80 bg-zinc-950/70 p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Credit Usage — Last {USAGE_DAYS} Days
          </p>
          {hasUsage ? (
            <AreaChart
              data={usageData}
              config={{ used: { label: 'Credits used', color: 'orange' } }}
              className="mt-4 h-56 w-full"
            >
              <Grid />
              <Area dataKey="used" />
              <XAxis dataKey="day" maxTicks={7} />
              <YAxis />
            </AreaChart>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
              No credit usage recorded yet. Generate something in the studio to see your usage here.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
