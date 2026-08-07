import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { Sidebar } from '@/components/home/Sidebar';
import { useSidebar } from '@/contexts/SidebarContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { appRoutes } from '@/lib/routes';
import ClipStudio from './ClipStudio';

export default function Clipper() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();

  const handleHomeViewChange = useCallback((view: string) => {
    navigate(appRoutes.home, { state: { activeView: view } });
  }, [navigate]);

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#08090d]">
      <div className="hidden md:block">
        <Sidebar activeView="clipper" onViewChange={handleHomeViewChange} />
      </div>

      <motion.div
        className="min-h-screen pb-20 md:pb-0"
        animate={{ marginLeft: isMobile ? 0 : (isCollapsed ? 64 : 256) }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        initial={false}
      >
        <ClipStudio showAppHeader={false} />
      </motion.div>

      <MobileBottomNav
        activeView="clipper"
        onViewChange={handleHomeViewChange}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
