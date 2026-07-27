import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Sparkles,
  Unplug,
  UserCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import AppShell from '@/components/layout/AppShell';
import { POSTZ_PROVIDER_META, channelStatusClass, channelStatusLabel, providerLabel } from '@/components/postz/postzMeta';
import { ApiKeysForm } from '@/components/settings/ApiKeysForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useCatalogModels } from '@/hooks/useCatalogModels';
import {
  usePostzChannels,
  usePostzIntegrationProviders,
  useRevokePostzIntegration,
  useStartPostzIntegration,
} from '@/hooks/usePostz';
import { getDesktopDeepLink, openExternalUrl } from '@/lib/desktop';
import { appRoutes, getSystemSectionFromLocation, getSystemSectionPath, type SystemSectionId } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import type { PostzComposioProviderSummary, PostzProvider } from '@/types/postz';
import SettingsBillingPage from './SettingsBillingPage';

const SYSTEM_SECTIONS: Array<{
  id: SystemSectionId;
  label: string;
  icon: typeof UserCircle;
  path: string;
}> = [
  { id: 'profile', label: 'Profile', icon: UserCircle, path: getSystemSectionPath('profile') },
  { id: 'appearance', label: 'Appearance', icon: Palette, path: getSystemSectionPath('appearance') },
  { id: 'models', label: 'Model Preferences', icon: Sparkles, path: getSystemSectionPath('models') },
  { id: 'billing', label: 'Billing & Credits', icon: BadgeDollarSign, path: getSystemSectionPath('billing') },
  { id: 'integrations', label: 'Integrations', icon: Link2, path: getSystemSectionPath('integrations') },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound, path: getSystemSectionPath('api-keys') },
];

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-white/10 bg-[#0d0e14]/80 p-5 md:p-6">
      <div className="mb-5">
        {eyebrow && (
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function getSystemIntegrationsReturnUrl(): string | null {
  const desktopUrl = getDesktopDeepLink(appRoutes.systemIntegrations);
  if (desktopUrl) return desktopUrl;
  if (typeof window === 'undefined') return null;
  return `${window.location.origin}${appRoutes.systemIntegrations}`;
}

function integrationStatusLabel(provider: PostzComposioProviderSummary): string {
  if (!provider.configured) return 'Setup required';
  if (!provider.implemented) return 'Coming soon';
  if (provider.status === 'disconnected') return 'Disconnected';
  return channelStatusLabel(provider.status);
}

function integrationStatusClass(provider: PostzComposioProviderSummary): string {
  if (provider.status === 'disconnected') return 'border-white/10 bg-white/5 text-zinc-400';
  return channelStatusClass(provider.status);
}

export default function SystemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, session, thirdwebAccount } = useAuth();
  const { models, total, scanned, isLoading, error } = useCatalogModels({
    includeAdvanced: true,
    limit: 8,
  });
  const activeSection = getSystemSectionFromLocation(location.pathname, location.search);
  const integrationsActive = activeSection === 'integrations';
  const integrationProvidersQuery = usePostzIntegrationProviders({ enabled: integrationsActive });
  const channelsQuery = usePostzChannels({ enabled: integrationsActive });
  const startIntegration = useStartPostzIntegration();
  const revokeIntegration = useRevokePostzIntegration();

  const metadata = useMemo(() => (user?.user_metadata ?? {}) as Record<string, unknown>, [user?.user_metadata]);
  const displayName =
    (typeof metadata.full_name === 'string' && metadata.full_name) ||
    (typeof metadata.name === 'string' && metadata.name) ||
    user?.email ||
    'WZRD user';
  const authProvider = user?.app_metadata?.provider ?? 'supabase';

  const navigateToSection = (section: (typeof SYSTEM_SECTIONS)[number]) => {
    navigate(section.path);
  };

  useEffect(() => {
    if (!integrationsActive) return;
    const params = new URLSearchParams(location.search);
    if (params.get('connected') !== '1') return;

    const status = (params.get('status') ?? 'success').toLowerCase();
    if (status === 'success') {
      toast.success('Connection synced');
      void integrationProvidersQuery.refetch();
      void channelsQuery.refetch();
    } else if (status === 'failed' || status === 'error') {
      toast.error('Connection failed');
    }

    params.delete('connected');
    params.delete('provider');
    params.delete('status');
    params.delete('connected_account_id');
    params.delete('channel');
    params.delete('state_id');
    const nextSearch = params.toString();
    navigate({ pathname: appRoutes.systemIntegrations, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [channelsQuery, integrationProvidersQuery, integrationsActive, location.search, navigate]);

  const handleConnectIntegration = async (provider: PostzComposioProviderSummary) => {
    try {
      const result = await startIntegration.mutateAsync({
        provider: provider.identifier,
        app_return_url: getSystemIntegrationsReturnUrl(),
      });
      const ok = await openExternalUrl(result.url);
      if (!ok) {
        toast.error('Unable to open browser');
      } else {
        toast.message('Continue in your browser');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Unable to start connection', { description: message });
    }
  };

  const handleRevokeIntegration = (provider: PostzComposioProviderSummary) => {
    if (typeof window !== 'undefined' && !window.confirm(`Revoke ${provider.name}?`)) return;
    revokeIntegration.mutate({
      channel_id: provider.channel_id,
      connected_account_id: provider.connected_account_id,
    });
  };

  const renderIntegrations = () => {
    const providers = integrationProvidersQuery.data ?? [];
    const channels = channelsQuery.data ?? [];
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    const connectedProviders = providers.filter((provider) => provider.connected || provider.channel_id);

    return (
      <Panel title="Integrations" eyebrow="System">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">Social publishing</p>
            <p className="mt-1 text-xs text-zinc-500">Postz channels backed by Composio managed connections.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
            onClick={() => {
              void integrationProvidersQuery.refetch();
              void channelsQuery.refetch();
            }}
            disabled={integrationProvidersQuery.isFetching || channelsQuery.isFetching}
          >
            <RefreshCw
              className={cn('mr-2 h-4 w-4', (integrationProvidersQuery.isFetching || channelsQuery.isFetching) && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>

        {integrationProvidersQuery.isLoading ? (
          <div className="flex min-h-40 items-center justify-center border border-white/10 bg-black/20 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : integrationProvidersQuery.isError ? (
          <div className="flex flex-col gap-3 border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>Unable to load integrations.</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void integrationProvidersQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-3">
              {providers.length === 0 ? (
                <div className="border border-dashed border-white/10 bg-black/20 p-5 text-sm text-zinc-500">
                  No social providers are available.
                </div>
              ) : (
                providers.map((provider) => {
                  const meta = POSTZ_PROVIDER_META[provider.identifier] ?? null;
                  const connecting =
                    startIntegration.isPending &&
                    typeof startIntegration.variables === 'object' &&
                    startIntegration.variables?.provider === provider.identifier;
                  const revoking =
                    revokeIntegration.isPending &&
                    (
                      revokeIntegration.variables?.channel_id === provider.channel_id ||
                      revokeIntegration.variables?.connected_account_id === provider.connected_account_id
                    );
                  const label = meta?.label ?? providerLabel(provider.identifier as PostzProvider);

                  return (
                    <div key={provider.identifier} className="border border-white/10 bg-black/25 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <img src={provider.logo} alt="" className="h-10 w-10 shrink-0 rounded-md border border-white/10 bg-white/[0.03] p-1" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-zinc-100">{label}</p>
                              <Badge variant="secondary" className={cn('border text-[10px] uppercase tracking-wide', meta?.colorClass ?? 'border-white/10 bg-white/5 text-zinc-300')}>
                                {provider.toolkit}
                              </Badge>
                              <Badge variant="secondary" className={cn('border text-[10px] uppercase tracking-wide', integrationStatusClass(provider))}>
                                {integrationStatusLabel(provider)}
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-zinc-500">
                              {provider.connected_account_id ?? (provider.configured ? 'Ready to connect' : 'Add COMPOSIO_API_KEY server-side')}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          {provider.connected ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                                onClick={() => handleConnectIntegration(provider)}
                                disabled={!provider.connectable || connecting || revoking}
                              >
                                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />}
                                Reconnect
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-red-500/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
                                onClick={() => handleRevokeIntegration(provider)}
                                disabled={revoking || connecting || (!provider.channel_id && !provider.connected_account_id)}
                              >
                                {revoking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Unplug className="mr-2 h-4 w-4" aria-hidden="true" />}
                                Revoke
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-[#f97316] text-white hover:bg-[#fb923c]"
                              onClick={() => handleConnectIntegration(provider)}
                              disabled={!provider.connectable || connecting}
                            >
                              {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />}
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border border-white/10 bg-black/20 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Connected accounts</p>
                  <p className="mt-1 text-xs text-zinc-500">{connectedProviders.length} active in Postz</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-[#f97316]" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                {connectedProviders.length === 0 ? (
                  <div className="border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                    No connected social accounts yet.
                  </div>
                ) : (
                  connectedProviders.map((provider) => {
                    const channel = provider.channel_id ? channelById.get(provider.channel_id) : null;
                    return (
                      <div key={`${provider.identifier}:${provider.connected_account_id ?? provider.channel_id}`} className="border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-100">{channel?.name ?? provider.name}</p>
                            <p className="mt-1 truncate text-xs text-zinc-500">
                              {channel?.username ?? provider.connected_account_id ?? provider.toolkit}
                            </p>
                          </div>
                          <Badge variant="secondary" className={cn('border text-[10px] uppercase tracking-wide', integrationStatusClass(provider))}>
                            {integrationStatusLabel(provider)}
                          </Badge>
                        </div>
                        <p className="mt-3 text-[11px] text-zinc-600">
                          {channel?.created_at ? `Connected ${new Date(channel.created_at).toLocaleDateString()}` : provider.toolkit}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </Panel>
    );
  };

  const content = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <Panel title="Appearance" eyebrow="System">
            <div className="flex flex-col gap-4 border border-white/10 bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-100">Theme</p>
                <p className="mt-1 text-sm text-zinc-500">Choose the display mode for this workspace.</p>
              </div>
              <ThemeToggle />
            </div>
          </Panel>
        );

      case 'models':
        return (
          <Panel title="Model Preferences" eyebrow="System">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Loading catalog</span>
                </>
              ) : error ? (
                <span className="text-amber-300">{error}</span>
              ) : (
                <span>
                  {total.toLocaleString()} models available, {scanned.toLocaleString()} scanned
                </span>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {models.map((model) => (
                <div key={model.id} className="border border-white/10 bg-black/25 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{model.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{model.description}</p>
                    </div>
                    {model.is_default && (
                      <Badge className="border-[#f97316]/30 bg-[#f97316]/15 text-[#f97316]">Default</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                    <span>{model.provider_label ?? model.provider ?? 'Provider'}</span>
                    <span>{model.media_type}</span>
                    <span>{model.ui_group}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        );

      case 'billing':
        return (
          <div className="overflow-hidden border border-white/10 bg-black/20">
            <SettingsBillingPage />
          </div>
        );

      case 'integrations':
        return renderIntegrations();

      case 'api-keys':
        return (
          <div className="system-api-keys">
            <ApiKeysForm />
          </div>
        );

      case 'profile':
      default:
        return (
          <Panel title="Profile" eyebrow="System">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-white/10 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Identity</p>
                <p className="mt-3 text-lg font-semibold text-zinc-50">{displayName}</p>
                <p className="mt-1 text-sm text-zinc-500">{user?.email ?? 'No email connected'}</p>
              </div>
              <div className="border border-white/10 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Access</p>
                <p className="mt-3 text-sm text-zinc-100">{String(authProvider)}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {session?.expires_at ? `Session expires ${new Date(session.expires_at * 1000).toLocaleString()}` : 'Session active'}
                </p>
              </div>
              <div className="border border-white/10 bg-black/25 p-4 md:col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Wallet</p>
                <p className="mt-3 break-all text-sm text-zinc-100">
                  {thirdwebAccount?.address ?? 'No wallet connected'}
                </p>
              </div>
            </div>
          </Panel>
        );
    }
  };

  return (
    <AppShell activeView="system" contentClassName="px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="border-b border-white/10 pb-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#f97316]">
                WZRD
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">System</h1>
            </div>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
              onClick={() => navigate(appRoutes.systemBilling)}
            >
              <BadgeDollarSign className="mr-2 h-4 w-4" aria-hidden="true" />
              Credits
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border border-white/10 bg-[#0d0e14]/80 p-2 lg:sticky lg:top-6 lg:self-start">
            <nav className="grid gap-1" aria-label="System sections">
              {SYSTEM_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => navigateToSection(section)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm transition-colors',
                      isActive
                        ? 'border border-[#f97316]/25 bg-[#f97316]/10 text-[#f97316]'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-100',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div>
            <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
              <Monitor className="h-4 w-4" aria-hidden="true" />
              <span>{SYSTEM_SECTIONS.find((section) => section.id === activeSection)?.label}</span>
            </div>
            {content()}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
