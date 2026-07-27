import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Sidebar } from '@/components/home/Sidebar';
import { appRoutes } from '@/lib/routes';

/**
 * Compatibility wrapper for older imports. Kanvas studio switching now lives in
 * the Kanvas page header/mobile controls; the left rail is global app nav.
 */
export function KanvasSidebar() {
  const navigate = useNavigate();

  const handleHomeViewChange = useCallback((view: string) => {
    navigate(appRoutes.home, { state: { activeView: view } });
  }, [navigate]);

  return <Sidebar activeView="kanvas" onViewChange={handleHomeViewChange} />;
}
