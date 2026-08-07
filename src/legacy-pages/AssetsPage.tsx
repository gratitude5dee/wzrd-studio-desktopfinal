import { AuraAssetStore } from '@/components/home/AuraAssetStore';
import { FloatingNavPill } from '@/components/home/FloatingNavPill';

const AssetsPage = () => {
  return (
    <main className="min-h-screen bg-background p-4 md:p-6" data-testid="asset-management-page">
      <div className="hidden md:block">
        <FloatingNavPill activeView="asset-store" />
      </div>
      <AuraAssetStore />
    </main>
  );
};

export default AssetsPage;
