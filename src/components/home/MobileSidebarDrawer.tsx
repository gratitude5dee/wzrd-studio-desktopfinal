import { useCallback, useState, type ReactNode } from 'react';
import { HelpCircle, ChevronDown, LogOut, Users, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import CreditsDisplay from '../CreditsDisplay';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
  PRIMARY_NAV_TREE,
  SECONDARY_NAV_ITEMS,
  SYSTEM_NAV_ITEMS,
  mergeNavRouteSearch,
  type AppNavItem,
} from './navConfig';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { appRoutes } from '@/lib/routes';
import { cn } from '@/lib/utils';

interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

const LIME_ITEM = 'border-[rgba(190,255,0,0.28)] bg-[rgba(190,255,0,0.13)] text-[#BEFF00]';

export const MobileSidebarDrawer = ({ isOpen, onClose, activeView, onViewChange }: MobileSidebarDrawerProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    studio: true,
    kanvas: true,
    clipper: true,
    settings: true,
  });

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
    onClose();
  }, [navigate, onClose]);

  const handleNavClick = useCallback(
    (item: AppNavItem) => {
      if (item.id === 'logout') {
        void handleLogout();
        return;
      }

      if (item.isAction) {
        onClose();
        return;
      }

      if (item.children?.length) {
        if (item.route) {
          navigate(mergeNavRouteSearch(item.route, location.search));
        }
        setOpenGroups((current) => ({ ...current, [item.id]: !current[item.id] }));
        return;
      }

      if (item.activeViewId) {
        const activeId = item.activeViewId;
        if (location.pathname === appRoutes.home) {
          onViewChange(activeId);
        } else {
          navigate(appRoutes.home, { state: { activeView: activeId } });
        }
        onClose();
        return;
      }

      if (item.route) {
        if (item.hardNavigate) {
          window.location.assign(item.route);
        } else {
          navigate(mergeNavRouteSearch(item.route, location.search));
        }
      } else {
        const activeId = item.id;
        if (location.pathname === appRoutes.home) {
          onViewChange(activeId);
        } else {
          navigate(appRoutes.home, { state: { activeView: activeId } });
        }
      }
      onClose();
    },
    [handleLogout, location.pathname, location.search, navigate, onClose, onViewChange],
  );

  const isItemActive = useCallback(
    (item: AppNavItem) => item.isActive?.(location.pathname, activeView, location.search) ?? activeView === item.id,
    [activeView, location.pathname, location.search],
  );

  const renderNavItem = useCallback(
    (item: AppNavItem, isChild = false): ReactNode => {
      const isActive = isItemActive(item);
      if (!item.children?.length) {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavClick(item)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            data-active={isActive ? 'true' : 'false'}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-all',
              isChild && 'ml-2 w-[calc(100%-0.5rem)] py-2.5 text-[13px]',
              isActive ? LIME_ITEM : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isActive ? 'bg-[rgba(190,255,0,0.18)]' : 'bg-muted/50')}>
              <Icon className={cn(isChild ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden="true" />
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.showBadge && (
              <Badge variant="secondary" className="border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.14)] text-[9px] text-[#BEFF00]">
                New
              </Badge>
            )}
          </button>
        );
      }

      const isOpenGroup = Boolean(openGroups[item.id]);
      const Icon = item.icon;
      return (
        <div key={item.id} className={cn(isChild && 'ml-2')}>
          <div className={cn('relative flex w-full rounded-xl border', isActive ? LIME_ITEM : 'border-transparent')}>
            <button
              type="button"
              aria-label={item.label}
              aria-expanded={isOpenGroup}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleNavClick(item)}
              className={cn(
                'flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all hover:bg-muted/50 hover:text-foreground',
                isActive ? 'text-[#BEFF00]' : 'text-muted-foreground',
              )}
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-[rgba(190,255,0,0.18)] text-[#BEFF00]' : 'bg-muted/50')}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="flex-1 truncate text-left">{item.label}</span>
              {item.showBadge && <Badge variant="secondary" className="border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.14)] text-[9px] text-[#BEFF00]">New</Badge>}
            </button>
            <button
              type="button"
              aria-label={`${isOpenGroup ? 'Collapse' : 'Expand'} ${item.label}`}
              aria-expanded={isOpenGroup}
              onClick={() => setOpenGroups((current) => ({ ...current, [item.id]: !current[item.id] }))}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', !isOpenGroup && '-rotate-90')} aria-hidden="true" />
            </button>
          </div>
          {isOpenGroup && (
            <div className="ml-5 mt-1 space-y-1 border-l border-border/60 pl-2">
              {item.children.map((child) => renderNavItem(child, true))}
            </div>
          )}
        </div>
      );
    },
    [handleNavClick, isItemActive, openGroups],
  );

  const primaryItems = PRIMARY_NAV_TREE.filter((item) => item.section === 'studio');
  const systemGroup = PRIMARY_NAV_TREE.find((item) => item.id === 'settings');
  const logoutItem = SYSTEM_NAV_ITEMS.find((item) => item.id === 'logout');

  return (
    <>
      <div
        className={cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity duration-300 md:hidden', isOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-50 flex h-full w-80 max-w-[88vw] flex-col md:hidden',
          'rounded-r-2xl border-r border-border/50 bg-card',
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile app navigation"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted/50"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>

        <div className="shrink-0 border-b border-border/50 p-4">
          <WorkspaceSwitcher />
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="App pages">
          {primaryItems.map((item) => renderNavItem(item))}

          {SECONDARY_NAV_ITEMS.length > 0 && (
            <section aria-label="More" className="mt-5 border-t border-border/50 pt-4">
              <div className="mb-3 flex items-center gap-2 px-3">
                <Users className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/70">More</span>
              </div>
              <div className="space-y-1">{SECONDARY_NAV_ITEMS.map((item) => renderNavItem(item))}</div>
            </section>
          )}
        </nav>

        <div className="shrink-0 border-t border-border/50 bg-card p-4">
          <div className="mb-4 rounded-xl border border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.1)] p-3">
            <CreditsDisplay showTooltip={false} />
          </div>
          {systemGroup && <div className="mb-1">{renderNavItem(systemGroup)}</div>}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Help"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            {logoutItem && (
              <button
                type="button"
                aria-label="Logout"
                onClick={() => handleNavClick(logoutItem)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
