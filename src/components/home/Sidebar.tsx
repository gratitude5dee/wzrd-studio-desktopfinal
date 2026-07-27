import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ChevronLeft, Sparkles, Users, LogOut, type LucideIcon } from 'lucide-react';
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
import { ShineBorder } from '@/components/ui/shine-border';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  APP_SIDEBAR_EXPANDED_WIDTH,
  useSidebar,
} from '@/contexts/SidebarContext';
import { supabase } from '@/integrations/supabase/client';
import { appRoutes } from '@/lib/routes';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const LIME = '#BEFF00';
const LIME_STRONG = '#9dcc00';
const SIDEBAR_NAV_BUTTON =
  'relative flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEFF00]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const SIDEBAR_FLOATING_RAIL_WIDTH = 56;

const SectionLabel = ({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) => (
  <div className="mb-3 flex items-center gap-2 px-3">
    <Icon className="h-3.5 w-3.5 text-zinc-600" />
    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">{label}</span>
  </div>
);

const SidebarNavButton = memo(function SidebarNavButton({
  item,
  isActive,
  isCollapsed,
  isChild = false,
  onClick,
}: {
  item: AppNavItem;
  isActive: boolean;
  isCollapsed: boolean;
  isChild?: boolean;
  onClick: (item: AppNavItem) => void;
}) {
  const Icon = item.icon;
  const button = (
    <motion.button
      type="button"
      whileHover={{ x: isCollapsed ? 0 : 2 }}
      whileTap={{ scale: 0.98 }}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      data-active={isActive ? 'true' : 'false'}
      onClick={() => onClick(item)}
      className={cn(
        SIDEBAR_NAV_BUTTON,
        isCollapsed ? 'h-10 justify-center px-2' : isChild ? 'px-2 py-2 text-[13px]' : 'px-3 py-2.5',
        isActive
          ? 'border border-[rgba(190,255,0,0.28)] bg-[rgba(190,255,0,0.13)] text-[#BEFF00] shadow-[inset_0_0_18px_rgba(190,255,0,0.05),0_8px_24px_rgba(190,255,0,0.08)]'
          : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-100',
      )}
    >
      {isActive && <ShineBorder shineColor={LIME} borderWidth={1} duration={10} />}
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
          isChild && 'h-7 w-7 rounded-md',
          isActive ? 'bg-[rgba(190,255,0,0.16)]' : 'bg-white/[0.04]',
        )}
      >
        <Icon className={cn(isChild ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden="true" />
      </span>
      {!isCollapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          {item.showBadge && (
            <Badge
              variant="secondary"
              className="border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.14)] px-1.5 py-0.5 text-[9px] font-semibold text-[#BEFF00]"
            >
              New
            </Badge>
          )}
        </>
      )}
      {item.showBadge && isCollapsed && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#BEFF00] shadow-[0_0_6px_rgba(190,255,0,0.6)]"
          aria-hidden="true"
        />
      )}
    </motion.button>
  );

  if (!isCollapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="z-[70] border-white/10 bg-[#111]/95 text-zinc-100">
        <span className="flex items-center gap-2">
          {item.label}
          {item.showBadge && (
            <Badge
              variant="secondary"
              className="border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.14)] px-1.5 py-0.5 text-[9px] text-[#BEFF00]"
            >
              New
            </Badge>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});

const SidebarGroupButton = memo(function SidebarGroupButton({
  item,
  isActive,
  isCollapsed,
  isOpen,
  onRowClick,
  onToggle,
}: {
  item: AppNavItem;
  isActive: boolean;
  isCollapsed: boolean;
  isOpen: boolean;
  onRowClick: (item: AppNavItem) => void;
  onToggle: (item: AppNavItem) => void;
}) {
  const Icon = item.icon;
  const button = (
    <div className="relative flex w-full">
      <motion.button
        type="button"
        whileHover={{ x: isCollapsed ? 0 : 2 }}
        whileTap={{ scale: 0.98 }}
        aria-label={item.label}
        aria-expanded={isOpen}
        aria-current={isActive ? 'page' : undefined}
        data-active={isActive ? 'true' : 'false'}
        onClick={() => onRowClick(item)}
        className={cn(
          SIDEBAR_NAV_BUTTON,
          isCollapsed ? 'h-10 justify-center px-2' : 'px-3 py-2.5 pr-10',
          isActive
            ? 'border border-[rgba(190,255,0,0.28)] bg-[rgba(190,255,0,0.13)] text-[#BEFF00] shadow-[inset_0_0_18px_rgba(190,255,0,0.05),0_8px_24px_rgba(190,255,0,0.08)]'
            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100',
        )}
      >
        {isActive && <ShineBorder shineColor={LIME} borderWidth={1} duration={10} />}
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] transition-all duration-200',
            isActive && 'bg-[rgba(190,255,0,0.16)]',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
            {item.showBadge && (
              <Badge
                variant="secondary"
                className="border-[rgba(190,255,0,0.24)] bg-[rgba(190,255,0,0.14)] px-1.5 py-0.5 text-[9px] font-semibold text-[#BEFF00]"
              >
                New
              </Badge>
            )}
          </>
        )}
      </motion.button>
      {!isCollapsed && (
        <button
          type="button"
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label}`}
          aria-expanded={isOpen}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(item);
          }}
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEFF00]/80"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', !isOpen && '-rotate-90')} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (!isCollapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="z-[70] border-white/10 bg-[#111]/95 text-zinc-100">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
});

export const Sidebar = memo(function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();
  const { isCollapsed, peekVisible, setIsCollapsed, setPeekVisible } = useSidebar();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    studio: true,
    kanvas: true,
    clipper: true,
    settings: true,
  });

  const isItemActive = useCallback(
    (item: AppNavItem) => item.isActive?.(location.pathname, activeView, location.search) ?? activeView === item.id,
    [activeView, location.pathname, location.search],
  );

  useEffect(() => {
    const activeGroups = PRIMARY_NAV_TREE.filter((item) => item.children?.length && isItemActive(item)).map((item) => item.id);
    if (!activeGroups.length) return;
    setOpenGroups((current) => {
      const next = { ...current };
      activeGroups.forEach((id) => {
        next[id] = true;
      });
      return next;
    });
  }, [isItemActive]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openPill = useCallback(() => {
    clearCloseTimer();
    setPeekVisible(true);
  }, [clearCloseTimer, setPeekVisible]);

  const schedulePillClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setPeekVisible(false), 150);
  }, [clearCloseTimer, setPeekVisible]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPeekVisible(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPeekVisible]);

  const handleLogout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
      return;
    }

    toast.success('Logged out successfully');
    navigate('/');
  }, [navigate]);

  const handleNavClick = useCallback(
    (item: AppNavItem) => {
      if (item.id === 'logout') {
        void handleLogout();
        return;
      }

      if (item.isAction) return;

      if (item.children?.length) {
        if (isCollapsed) {
          setIsCollapsed(false);
          setOpenGroups((current) => ({ ...current, [item.id]: true }));
        } else if (item.route) {
          navigate(item.route);
        } else {
          setOpenGroups((current) => ({ ...current, [item.id]: !current[item.id] }));
        }
        return;
      }

      if (item.activeViewId) {
        const activeId = item.activeViewId;
        if (location.pathname === appRoutes.home) {
          onViewChange(activeId);
        } else {
          navigate(appRoutes.home, { state: { activeView: activeId } });
        }
        return;
      }

      if (item.route) {
        if (item.hardNavigate) {
          window.location.assign(item.route);
          return;
        }

        navigate(mergeNavRouteSearch(item.route, location.search));
        return;
      }

      const activeId = item.id;
      if (location.pathname === appRoutes.home) {
        onViewChange(activeId);
        return;
      }

      navigate(appRoutes.home, { state: { activeView: activeId } });
    },
    [handleLogout, isCollapsed, location.pathname, location.search, navigate, onViewChange, setIsCollapsed],
  );

  const handleGroupToggle = useCallback((item: AppNavItem) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setOpenGroups((current) => ({ ...current, [item.id]: true }));
      return;
    }
    setOpenGroups((current) => ({ ...current, [item.id]: !current[item.id] }));
  }, [isCollapsed, setIsCollapsed]);

  const renderNavItem = useCallback(
    (item: AppNavItem, isChild = false): ReactNode => {
      const active = isItemActive(item);
      if (!item.children?.length) {
        return (
          <SidebarNavButton
            key={item.id}
            item={item}
            isActive={active}
            isCollapsed={isCollapsed}
            isChild={isChild}
            onClick={handleNavClick}
          />
        );
      }

      const isOpen = Boolean(openGroups[item.id]);
      return (
        <div key={item.id} className={cn(isChild && 'ml-2')}>
          <SidebarGroupButton
            item={item}
            isActive={active}
            isCollapsed={isCollapsed}
            isOpen={isOpen}
            onRowClick={handleNavClick}
            onToggle={handleGroupToggle}
          />
          <AnimatePresence initial={false}>
            {isOpen && !isCollapsed && (
              <motion.div
                id={`nav-group-${item.id}`}
                initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.1 : 0.18, ease: 'easeOut' }}
                className="ml-5 mt-1 space-y-1 overflow-hidden border-l border-white/[0.08] pl-2"
              >
                {item.children.map((child) => renderNavItem(child, true))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    },
    [handleGroupToggle, handleNavClick, isCollapsed, isItemActive, openGroups, shouldReduceMotion],
  );

  const sidebarWidth = isCollapsed ? SIDEBAR_FLOATING_RAIL_WIDTH : APP_SIDEBAR_EXPANDED_WIDTH;
  const shouldRenderSidebar = !isCollapsed || peekVisible;
  const floatingInitial = isCollapsed ? { x: shouldReduceMotion ? 0 : -72, opacity: 0 } : false;
  const floatingExit = isCollapsed ? { x: shouldReduceMotion ? 0 : -72, opacity: 0 } : undefined;
  const floatingTransition = isCollapsed
    ? { duration: shouldReduceMotion ? 0.12 : 0.16, ease: 'easeOut' as const }
    : { type: 'spring' as const, stiffness: 320, damping: 34 };
  const primaryItems = PRIMARY_NAV_TREE.filter((item) => item.section === 'studio');
  const systemGroup = PRIMARY_NAV_TREE.find((item) => item.id === 'settings');
  const logoutItem = SYSTEM_NAV_ITEMS.find((item) => item.id === 'logout');

  return (
    <TooltipProvider delayDuration={180}>
      {isCollapsed && (
        <div
          className={cn('fixed inset-y-0 left-0 z-40 hidden md:block', peekVisible ? 'w-[80px]' : 'w-3')}
          data-testid="sidebar-hover-zone"
          onPointerEnter={openPill}
          onPointerLeave={schedulePillClose}
          aria-hidden="true"
        >
          <div className="absolute left-0 top-14 h-[calc(100%-7rem)] w-0.5 rounded-r-full bg-[#BEFF00]/55 opacity-70 shadow-[0_0_16px_rgba(190,255,0,0.25)] transition-opacity hover:opacity-100" />
        </div>
      )}

      <AnimatePresence initial={false}>
        {shouldRenderSidebar && (
          <motion.aside
            key={isCollapsed ? 'floating-sidebar-pill' : 'expanded-sidebar'}
            aria-label="Primary app navigation"
            data-testid="app-sidebar"
            data-state={isCollapsed ? 'collapsed' : 'expanded'}
            data-peek-visible={peekVisible ? 'true' : 'false'}
            tabIndex={isCollapsed ? 0 : undefined}
            initial={floatingInitial}
            animate={{ width: sidebarWidth, x: 0, opacity: 1 }}
            exit={floatingExit}
            transition={floatingTransition}
            onPointerEnter={isCollapsed ? openPill : undefined}
            onPointerLeave={isCollapsed ? schedulePillClose : undefined}
            className={cn(
              'fixed z-50 hidden flex-col overflow-hidden border-r text-zinc-100 backdrop-blur-xl md:flex',
              isCollapsed
                ? 'left-3 top-3 h-[calc(100vh-1.5rem)] rounded-2xl border-white/[0.08] bg-[#07070A]/98 shadow-[8px_0_34px_rgba(0,0,0,0.48)]'
                : 'left-0 top-0 h-screen border-[rgba(190,255,0,0.12)] bg-[#0A0A0F]/96 shadow-[12px_0_48px_rgba(0,0,0,0.42)]',
            )}
          >
            <div
              className={cn(
                'pointer-events-none absolute inset-0 bg-gradient-to-br from-[#BEFF00]/[0.08] via-transparent to-transparent',
                isCollapsed && 'opacity-35',
              )}
            />
            {!isCollapsed && (
              <div className="pointer-events-none absolute inset-0 opacity-70">
                <ShineBorder shineColor={[LIME, LIME_STRONG]} borderWidth={1} duration={8} />
              </div>
            )}
            {isCollapsed && (
              <div
                className="pointer-events-none absolute inset-y-4 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent"
                aria-hidden="true"
              />
            )}
            <div className="pointer-events-none absolute left-4 right-4 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.1] to-transparent" />

            <motion.button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              className="absolute -right-3 top-6 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#18181b] text-zinc-400 shadow-md transition-colors hover:bg-[#222226] hover:text-zinc-100"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
            >
              <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', isCollapsed && 'rotate-180')} />
            </motion.button>

            <div className={cn('relative z-10 shrink-0 border-b border-white/[0.06]', isCollapsed ? 'p-2' : 'p-4')}>
              <WorkspaceSwitcher isCollapsed={isCollapsed} />
            </div>

            <nav
              data-tour="sidebar-nav"
              className={cn('relative z-10 flex flex-1 flex-col overflow-y-auto', isCollapsed ? 'gap-3 p-2' : 'gap-2 p-4')}
              aria-label="App pages"
            >
              <div className="space-y-1">{primaryItems.map((item) => renderNavItem(item))}</div>

              {!isCollapsed && SECONDARY_NAV_ITEMS.length > 0 && (
                <section aria-label="More" className="mt-4 border-t border-white/[0.06] pt-4">
                  <SectionLabel icon={Users} label="More" />
                  <div className="space-y-1">{SECONDARY_NAV_ITEMS.map((item) => renderNavItem(item))}</div>
                </section>
              )}

              <section aria-label="System" className="mt-auto border-t border-white/[0.06] pt-4">
                {!isCollapsed && (
                  <div className="mb-4 rounded-xl border border-[rgba(190,255,0,0.24)] bg-gradient-to-br from-[#BEFF00]/15 to-[#9dcc00]/[0.06] p-3">
                    <CreditsDisplay showTooltip={false} />
                  </div>
                )}
                {systemGroup && renderNavItem(systemGroup)}
                {logoutItem && (
                  <div className="mt-1">
                    <SidebarNavButton
                      item={logoutItem}
                      isActive={false}
                      isCollapsed={isCollapsed}
                      onClick={handleNavClick}
                    />
                  </div>
                )}
              </section>
            </nav>

            {isCollapsed && (
              <div className="relative z-10 shrink-0 border-t border-white/[0.06] p-2">
                <img src="/lovable-uploads/wzrdtechlogo.png" alt="WZRD" className="mx-auto h-8 w-8 object-contain" />
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
});
