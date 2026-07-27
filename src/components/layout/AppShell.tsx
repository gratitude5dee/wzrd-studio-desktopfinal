import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { AppSidebarInset } from '@/components/home/AppSidebarInset';
import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { MobileHeader } from '@/components/home/MobileHeader';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { Sidebar } from '@/components/home/Sidebar';
import { appRoutes } from '@/lib/routes';
import { cn } from '@/lib/utils';

interface AppShellProps {
  activeView: string;
  children: ReactNode;
  className?: string;
  contentAs?: 'div' | 'main';
  contentClassName?: string;
  onViewChange?: (view: string) => void;
}

export function AppShell({
  activeView,
  children,
  className,
  contentAs = 'main',
  contentClassName,
  onViewChange,
}: AppShellProps) {
  const navigate = useNavigate();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const navigateToHomeView = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );
  const handleHomeViewChange = onViewChange ?? navigateToHomeView;

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  return (
    <div className={cn('min-h-screen bg-[#08090d] text-zinc-100', className)}>
      <div className="hidden md:block">
        <Sidebar activeView={activeView} onViewChange={handleHomeViewChange} />
      </div>

      <MobileSidebarDrawer
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        activeView={activeView}
        onViewChange={handleHomeViewChange}
      />

      <MobileHeader onMenuClick={() => setIsMobileSidebarOpen(true)} />

      <AppSidebarInset as={contentAs} className={cn('min-h-screen pb-24 md:pb-8', contentClassName)}>
        {children}
      </AppSidebarInset>

      <MobileBottomNav
        activeView={activeView}
        onViewChange={handleHomeViewChange}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}

export default AppShell;
