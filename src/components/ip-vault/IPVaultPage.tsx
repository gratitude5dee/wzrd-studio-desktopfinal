import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Sidebar } from '@/components/home/Sidebar';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { MobileHeader } from '@/components/home/MobileHeader';
import { useSidebar } from '@/contexts/SidebarContext';
import { useIsMobile } from '@/hooks/use-mobile';
import wzrdLogo from '@/assets/wzrd-logo.png';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { staticAssetUrl } from '@/lib/staticAsset';
import { ROYALTY_POLICY_LAP_ADDRESS } from '@/lib/story/constants';
import { claimVaultRevenueOnStory, registerVaultItemOnStory } from '@/lib/story/registration';
import { ipVaultService } from '@/services/ipVaultService';
import { useStoryProtocolClient } from '@/hooks/useStoryProtocolClient';
import type { IPVaultItem, IPVaultLicenseProfile, IPVaultRelationshipType } from '@/types/ip-vault';
import type { StatusFilter } from './ip-vault-utils';

import { IPVaultSummary } from './IPVaultSummary';
import { IPVaultGallery } from './IPVaultGallery';
import { IPVaultInspector } from './IPVaultInspector';
import { IPVaultVoiceBridge } from './IPVaultVoiceBridge';

export function IPVaultPage() {
  const navigate = useNavigate();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const isMobile = useIsMobile();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleHomeViewChange = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );

  const storyWallet = useStoryProtocolClient();
  const [items, setItems] = useState<IPVaultItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const selectedItem = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const registeredParents = useMemo(
    () => items.filter((i) => i.registration_status === 'registered' && i.ip_id),
    [items],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.registration_status !== statusFilter) return false;
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        return `${item.title} ${item.asset_kind} ${item.description ?? ''}`.toLowerCase().includes(term);
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const rows = await ipVaultService.list();
      setItems(rows);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load IP Vault.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const replaceItem = (item: IPVaultItem) => {
    setItems((current) => {
      const exists = current.some((c) => c.id === item.id);
      return exists ? current.map((c) => (c.id === item.id ? item : c)) : [item, ...current];
    });
    setSelectedId(item.id);
  };

  const updateRights = async (patch: {
    licenseProfile?: IPVaultLicenseProfile;
    relationshipType?: IPVaultRelationshipType;
    parentIpIds?: string[];
    licenseTermsIds?: string[];
    commercialRevShare?: number | null;
    mintingFeeWip?: number | null;
  }) => {
    if (!selectedItem) return;
    const updated = await ipVaultService.updateRights(selectedItem.id, {
      licenseProfile: patch.licenseProfile ?? selectedItem.license_profile,
      relationshipType: patch.relationshipType ?? selectedItem.relationship_type,
      parentIpIds: patch.parentIpIds ?? selectedItem.parent_ip_ids,
      licenseTermsIds: patch.licenseTermsIds ?? selectedItem.license_terms_ids,
      royaltyPolicy: selectedItem.royalty_policy ?? ROYALTY_POLICY_LAP_ADDRESS,
      commercialRevShare: patch.commercialRevShare ?? selectedItem.commercial_rev_share,
      mintingFeeWip: patch.mintingFeeWip ?? selectedItem.minting_fee_wip,
    });
    replaceItem(updated);
  };

  const handlePrepareMetadata = async () => {
    if (!selectedItem) return;
    setActionLoading('metadata');
    try {
      const result = await ipVaultService.pinStoryMetadata(selectedItem.id);
      replaceItem(result.item);
      toast.success('Story metadata pinned to IPFS.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pin Story metadata.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegister = async (item: IPVaultItem) => {
    if (!storyWallet.isConnected) {
      toast.error('Connect a wallet before registering IP.');
      return;
    }
    if (!storyWallet.isOnAeneid) {
      toast.error('Switch wallet to Story Aeneid first.');
      return;
    }

    setActionLoading('register');
    try {
      let prepared = item;
      if (!prepared.ip_metadata_uri || !prepared.nft_metadata_uri) {
        setActionLoading('metadata');
        const pinResult = await ipVaultService.pinStoryMetadata(item.id);
        prepared = pinResult.item;
        replaceItem(prepared);
        setActionLoading('register');
      }

      replaceItem(await ipVaultService.markRegistering(prepared.id));
      const client = await storyWallet.createStoryClient();
      const result = await registerVaultItemOnStory(client, prepared, {
        walletAddress: storyWallet.address,
      });
      const registered = await ipVaultService.persistRegistration(prepared.id, result);
      replaceItem(registered);
      toast.success('IP registered on Story Protocol.');
    } catch (error) {
      await ipVaultService.markRegistrationFailed(item.id, error instanceof Error ? error.message : 'Registration failed.');
      await loadItems();
      toast.error(error instanceof Error ? error.message : 'Story registration failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimRevenue = async (item: IPVaultItem) => {
    if (!storyWallet.address) {
      toast.error('Connect a wallet before claiming revenue.');
      return;
    }
    setActionLoading('claim');
    try {
      const client = await storyWallet.createStoryClient();
      const result = await claimVaultRevenueOnStory(client, item, storyWallet.address);
      if (result.txHash) {
        const updated = await ipVaultService.update(item.id, {
          last_claim_tx_hash: result.txHash,
          last_claimed_at: new Date().toISOString(),
        } as Partial<IPVaultItem>);
        replaceItem(updated);
      }
      toast.success(result.txHash ? `Claim submitted: ${result.txHash.slice(0, 10)}…` : 'Claim submitted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Revenue claim failed.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar activeView="ip-vault" onViewChange={handleHomeViewChange} />
      </div>

      {/* Mobile Sidebar Drawer */}
      <MobileSidebarDrawer
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        activeView="ip-vault"
        onViewChange={handleHomeViewChange}
      />

      {/* Main Content */}
      <motion.div
        className="flex-1 pb-20 md:pb-0 min-h-screen"
        animate={{ marginLeft: isMobile ? 0 : (isCollapsed ? 64 : 256) }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        initial={false}
      >
        {/* Mobile Header */}
        <MobileHeader onMenuClick={() => setIsMobileSidebarOpen(true)} />

        {/* Desktop top bar with back chevron + logo */}
        <header className={cn(
          "border-b border-orange-100 dark:border-[rgba(249,115,22,0.1)]",
          "bg-white/90 dark:bg-[#0a0a0f]/90 backdrop-blur-xl",
          "hidden md:block"
        )}>
          <div className="h-16 flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {isCollapsed && (
                  <motion.button
                    initial={{ opacity: 0, x: -10, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -10, scale: 0.8 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setIsCollapsed(false)}
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200",
                      "bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/[0.1]",
                      "hover:border-orange-300 dark:hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.15)]",
                      "text-zinc-500 dark:text-zinc-400 hover:text-orange-500"
                    )}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>

              <button
                onClick={() => navigate(appRoutes.home)}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
                  "text-zinc-500 dark:text-zinc-400 hover:text-orange-500",
                  "hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                )}
                aria-label="Back to Home"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <img
                src={staticAssetUrl(wzrdLogo)}
                alt="WZRD STUDIO Logo"
                className="h-20 object-contain"
              />
              <span className="text-xs text-primary bg-primary/15 px-2 py-0.5 rounded-full border border-primary/25 font-medium">
                ALPHA
              </span>
              <div className="h-5 w-px bg-[rgba(249,115,22,0.1)]" />
              <span className="text-lg font-semibold text-foreground">IP Vault</span>
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <div className="bg-[#08080b] text-white min-h-[calc(100vh-64px)]" data-testid="ip-vault-page">
          <IPVaultVoiceBridge
            items={items}
            selectedItem={selectedItem}
            onSelectItem={(id) => setSelectedId(id)}
            onRefresh={loadItems}
            onUpdateRights={updateRights}
            onRegister={handleRegister}
            onClaimRevenue={handleClaimRevenue}
          />

          {/* Section Header */}
          <div className="border-b border-white/[0.08] bg-[#0c0c10]/95 px-4 py-5 backdrop-blur md:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  IP Vault
                </div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Rights registry for finalized assets
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-500">
                  Manage IP registration, licensing, derivatives, royalties, and provenance proofs on Story Protocol.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-zinc-300">
                  {items.length} finalized
                </Badge>
                <Badge variant="outline" className="border-lime-300/20 bg-lime-300/10 text-lime-200">
                  {items.filter((i) => i.registration_status === 'registered').length} registered
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadItems()}
                  disabled={loading}
                  className="gap-2 border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Summary metrics */}
          <div className="px-4 pt-5 md:px-6">
            <IPVaultSummary items={items} wallet={storyWallet} />
          </div>

          {/* Main content */}
          <main className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <IPVaultGallery
              items={items}
              filteredItems={filteredItems}
              selectedId={selectedId}
              loading={loading}
              search={search}
              statusFilter={statusFilter}
              onSearchChange={setSearch}
              onStatusFilterChange={setStatusFilter}
              onSelectItem={setSelectedId}
            />

            <IPVaultInspector
              item={selectedItem}
              wallet={storyWallet}
              registeredParents={registeredParents}
              actionLoading={actionLoading}
              onPrepareMetadata={() => void handlePrepareMetadata()}
              onRegister={() => selectedItem && void handleRegister(selectedItem)}
              onClaimRevenue={() => selectedItem && void handleClaimRevenue(selectedItem)}
              onUpdateRights={updateRights}
            />
          </main>
        </div>
      </motion.div>
    </div>
  );
}
