import { ChevronLeft, LogOut } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  FLOATING_NAV_ITEMS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavItem,
  type SidebarNavNode,
} from './navigation';

/** Shared focus treatment: visible ring on keyboard focus only. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas';

export const FloatingNavButton = memo(function FloatingNavButton({
  item,
  isActive,
  isChild = false,
  isExpanded,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  isChild?: boolean;
  isExpanded?: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={item.label}
          aria-current={isActive ? 'page' : undefined}
          aria-expanded={isExpanded}
          className={cn(
            'relative flex items-center justify-center rounded-wzrd-sm',
            'transition-[background-color,color] duration-wzrd-control',
            FOCUS_RING,
            'h-11 w-11',
            isActive
              ? 'bg-accent-ember/12 text-accent-ember'
              : 'text-text-secondary hover:bg-accent-air/8 hover:text-text-primary',
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-wzrd-chip bg-accent-ember" />
          )}
          <Icon className={cn(isChild ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="z-[60]">
        <span className="flex items-center gap-2">
          {item.label}
          {item.showBadge && (
            <Badge variant="secondary" className="text-[9px] bg-accent-ember/15 text-accent-ember border-accent-ember/25 px-1.5 py-0.5">
              New
            </Badge>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});

export interface FloatingNavPillProps {
  activeView: string;
  onViewChange?: (view: string) => void;
  /** Rendered as an expand button when provided (sidebar collapsed mode). */
  onExpand?: () => void;
}

/**
 * Persistent icon rail anchored to the left edge. Used by the collapsed home
 * sidebar and standalone on pages without a full sidebar (Kanvas, timeline,
 * editors, …). Always visible and reachable by keyboard.
 */
export const FloatingNavPill = memo(function FloatingNavPill({
  activeView,
  onViewChange,
  onExpand,
}: FloatingNavPillProps) {
  const { isGroupOpen, toggleGroup } = useNavGroupState(activeView);
  const navigate = useNavigate();

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
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
    } else if (onViewChange) {
      onViewChange(item.id);
    } else {
      navigate(appRoutes.home);
    }
  }, [navigate, onViewChange]);

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
        aria-label="Primary navigation rail"
        className={cn(
          'fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 flex max-h-[calc(100vh-100px)] w-14 flex-col items-center py-3 rounded-wzrd-lg',
          'bg-surface-raised border border-line-subtle shadow-lg',
        )}
      >
        {onExpand && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onExpand}
                  aria-label="Expand sidebar"
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-wzrd-sm text-text-secondary',
                    'transition-[background-color,color] duration-wzrd-control hover:bg-accent-air/8 hover:text-text-primary',
                    FOCUS_RING,
                  )}
                >
                  <ChevronLeft className="h-[18px] w-[18px] rotate-180" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="z-[60]">Expand sidebar</TooltipContent>
            </Tooltip>

            <div className="mx-auto my-2 h-px w-6 shrink-0 bg-line-subtle" />
          </>
        )}

        {/* Nav items */}
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
});
