import { AuraAssetStore } from '@/components/home/AuraAssetStore';
import AppShell from '@/components/layout/AppShell';

const AssetsPage = () => {
  return (
    <AppShell
      activeView="asset-store"
      contentClassName="min-h-screen bg-background p-4 text-foreground md:p-6"
    >
      <AuraAssetStore />
    </AppShell>
  );
};

export default AssetsPage;
