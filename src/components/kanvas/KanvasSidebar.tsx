import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { supabase } from '@/integrations/supabase/client';
import type { KanvasStudio } from '@/features/kanvas/types';
import { FloatingNavButton } from '@/components/home/Sidebar';
import {
  FLOATING_NAV_ITEMS,
  isNavGroup,
  kanvasStudioFromNavItem,
  useNavGroupState,
  type SidebarNavItem,
  type SidebarNavNode,
} from '@/components/home/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/** Shared focus treatment: visible ring on keyboard focus only. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas';

interface KanvasSidebarProps {
  activeStudio: KanvasStudio;
  onStudioChange: (studio: KanvasStudio) => void;
}

export function KanvasSidebar({ activeStudio, onStudioChange }: KanvasSidebarProps) {
  const navigate = useNavigate();
  const activeView = `kanvas-${activeStudio}`;
  const { isGroupOpen, toggleGroup } = useNavGroupState(activeView);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
  };

  const handleItemClick = useCallback((item: SidebarNavItem) => {
    const studio = kanvasStudioFromNavItem(item);
    if (studio) {
      onStudioChange(studio as KanvasStudio);
      return;
    }
    if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
      return;
    }
    navigate(appRoutes.home, { state: { activeView: item.id } });
  }, [navigate, onStudioChange]);

  const handleNodeClick = useCallback((node: SidebarNavNode) => {
    if (isNavGroup(node)) {
      toggleGroup(node.id);
      return;
    }
    handleItemClick(node);
  }, [handleItemClick, toggleGroup]);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        aria-label="Kanvas navigation rail"
        className={cn(
          'hidden md:flex fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 max-h-[calc(100vh-100px)] w-14 flex-col items-center py-3 rounded-wzrd-lg',
          'bg-surface-raised border border-line-subtle shadow-lg',
        )}
      >
        {/* Home button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate(appRoutes.home)}
              aria-label="Home"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-wzrd-sm text-text-secondary',
                'transition-[background-color,color] duration-wzrd-control hover:bg-accent-air/8 hover:text-text-primary',
                FOCUS_RING,
              )}
            >
              <Home className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[60]">Home</TooltipContent>
        </Tooltip>

        {/* Divider */}
        <div className="mx-auto my-2 h-px w-6 shrink-0 bg-line-subtle" />

        {/* Nav items (same structure as the home sidebar) */}
        <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto hide-scrollbar">
          {FLOATING_NAV_ITEMS.map((entry) => {
            if (entry.kind === 'divider') {
              return <div key={entry.id} className="mx-auto my-2 h-px w-6 shrink-0 bg-line-subtle" />;
            }

            const node = entry.node;
            const group = isNavGroup(node) ? node : null;
            const isOpen = group ? isGroupOpen(group.id) : false;

            return (
              <div key={node.id} className="flex shrink-0 flex-col items-center gap-1">
                <FloatingNavButton
                  item={node}
                  isActive={activeView === node.id}
                  isExpanded={group ? isOpen : undefined}
                  onClick={() => handleNodeClick(node)}
                />
                {group && isOpen && group.children.map((child) => (
                  <FloatingNavButton
                    key={child.id}
                    item={child}
                    isActive={activeView === child.id}
                    isChild
                    onClick={() => handleItemClick(child)}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-auto my-2 h-px w-6 shrink-0 bg-line-subtle" />

        {/* Logout */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-wzrd-sm text-text-secondary',
                'transition-[background-color,color] duration-wzrd-control hover:bg-status-danger/10 hover:text-status-danger',
                FOCUS_RING,
              )}
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="z-[60]">Logout</TooltipContent>
        </Tooltip>

        {/* Brand dot */}
        <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
          <div className="h-2 w-2 rounded-wzrd-chip bg-accent-ember/60" />
        </div>
      </aside>
    </TooltipProvider>
  );
}
