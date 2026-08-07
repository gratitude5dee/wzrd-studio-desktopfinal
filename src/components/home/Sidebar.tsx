import { ChevronLeft, LogOut, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import CreditsDisplay from '../CreditsDisplay';
import { Badge } from '@/components/ui/badge';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import { appRoutes } from '@/lib/routes';
import {
  SIDEBAR_SECTIONS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './navigation';
import { FloatingNavPill, FloatingNavButton } from './FloatingNavPill';

export { FloatingNavButton } from './FloatingNavPill';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

const SIDEBAR_VARIANTS = {
  expanded: { width: 256 },
  collapsed: { width: 64 },
};

/** Shared focus treatment: visible ring on keyboard focus only. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas';

const SectionLabel = ({ icon: Icon, label, accent = false }: { icon: LucideIcon; label: string; accent?: boolean }) => (
  <div className="flex items-center gap-2 px-3 mb-3">
    <Icon className={cn("w-3.5 h-3.5", accent ? "text-accent-ember" : "text-text-tertiary")} />
    <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.15em]">
      {label}
    </span>
  </div>
);

const NavBadge = () => (
  <Badge
    variant="secondary"
    className="text-[9px] bg-accent-ember/15 text-accent-ember border-accent-ember/25 px-1.5 py-0.5 font-semibold"
  >
    New
  </Badge>
);

const PrimaryNavItem = memo(function PrimaryNavItem({
  item,
  isActive,
  isCollapsed,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: (item: SidebarNavItem) => void;
}) {
  const Icon = item.icon;

  const content = (
    <motion.button
      whileTap={{ scale: 0.98 }}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onClick(item)}
      className={cn(
        "relative w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-wzrd-md text-sm font-medium",
        "transition-[background-color,color] duration-wzrd-control",
        FOCUS_RING,
        isCollapsed && "justify-center px-2",
        isActive
          ? "bg-accent-ember/12 text-accent-ember border border-accent-ember/25"
          : "text-text-secondary hover:text-text-primary hover:bg-accent-air/8 border border-transparent"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-wzrd-sm flex items-center justify-center flex-shrink-0",
        isActive ? "bg-accent-ember/15" : "bg-surface-raised"
      )}>
        <Icon className={cn("w-4 h-4", isActive && "text-accent-ember")} />
      </div>
      {!isCollapsed && (
        <span className="flex-1 text-left whitespace-nowrap">
          {item.label}
        </span>
      )}
      {item.showBadge && !isCollapsed && <NavBadge />}
    </motion.button>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          <span className="flex items-center gap-2">
            {item.label}
            {item.showBadge && <NavBadge />}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
});

const ChildNavItem = memo(function ChildNavItem({
  item,
  isActive,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  onClick: (item: SidebarNavItem) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => onClick(item)}
      className={cn(
        "w-full min-h-[44px] flex items-center gap-2.5 px-2.5 py-2 rounded-wzrd-sm text-sm",
        "transition-[background-color,color] duration-wzrd-control",
        FOCUS_RING,
        isActive
          ? "bg-accent-ember/10 text-accent-ember"
          : "text-text-secondary hover:text-text-primary hover:bg-accent-air/8"
      )}
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-accent-ember")} />
      <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
      {item.showBadge && <NavBadge />}
    </button>
  );
});

const NavGroupBlock = memo(function NavGroupBlock({
  group,
  activeView,
  isOpen,
  onToggle,
  onLandingClick,
  onChildClick,
}: {
  group: SidebarNavGroup;
  activeView: string;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
  onLandingClick: (group: SidebarNavGroup) => void;
  onChildClick: (item: SidebarNavItem) => void;
}) {
  const subnavId = `sidebar-subnav-${group.id}`;

  return (
    <div>
      <div className="flex items-center gap-1">
        <PrimaryNavItem
          item={group}
          isActive={activeView === group.id}
          isCollapsed={false}
          onClick={() => onLandingClick(group)}
        />
        <button
          type="button"
          aria-label={`Toggle ${group.label} section`}
          aria-expanded={isOpen}
          aria-controls={subnavId}
          onClick={() => onToggle(group.id)}
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-wzrd-sm text-text-secondary",
            "transition-[background-color,color] duration-wzrd-control hover:bg-accent-air/8 hover:text-text-primary",
            FOCUS_RING,
          )}
        >
          <ChevronLeft className={cn(
            "w-4 h-4 transition-transform duration-wzrd-control",
            isOpen ? "-rotate-90" : "rotate-0"
          )} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            id={subnavId}
            className="mt-1 ml-6 pl-3 border-l border-line-subtle space-y-0.5 overflow-hidden"
          >
            {group.children.length === 0 ? (
              <p className="text-xs text-text-tertiary py-2 italic dark:text-muted-foreground/50">{group.emptyLabel}</p>
            ) : (
              group.children.map((child) => (
                <ChildNavItem
                  key={child.id}
                  item={child}
                  isActive={activeView === child.id}
                  onClick={onChildClick}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export const Sidebar = memo(function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { isGroupOpen, toggleGroup, openGroup } = useNavGroupState(activeView);
  const { isCollapsed, setIsCollapsed } = useSidebar();
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

  const handlePrimaryNavClick = useCallback((item: SidebarNavItem) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
    } else {
      onViewChange(item.id);
    }
  }, [navigate, onViewChange]);

  const handleGroupLandingClick = useCallback((group: SidebarNavGroup) => {
    openGroup(group.id);
    if (group.landingViewId) {
      onViewChange(group.landingViewId);
      return;
    }
    handlePrimaryNavClick(group);
  }, [handlePrimaryNavClick, onViewChange, openGroup]);

  // ── Collapsed rail ──
  if (isCollapsed) {
    return (
      <FloatingNavPill
        activeView={activeView}
        onViewChange={onViewChange}
        onExpand={() => setIsCollapsed(false)}
      />
    );
  }

  // ── Expanded rail ──
  return (
    <TooltipProvider>
      <motion.aside
        variants={SIDEBAR_VARIANTS}
        animate="expanded"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "h-screen flex flex-col fixed left-0 top-0 z-50 border-r",
          "bg-surface-canvas border-line-subtle"
        )}
      >
        {/* Collapse control */}
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse sidebar"
          className={cn(
            "absolute -right-3 top-6 z-50 h-6 w-6 rounded-wzrd-chip bg-surface-raised border border-line-subtle",
            "flex items-center justify-center text-text-secondary",
            "transition-colors duration-wzrd-control hover:text-text-primary",
            FOCUS_RING,
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Workspace Switcher */}
        <div className="relative z-10 border-b border-line-subtle p-4">
          <WorkspaceSwitcher isCollapsed={false} />
        </div>

        {/* Main Navigation */}
        <nav data-tour="sidebar-nav" className="relative z-10 flex-1 space-y-6 overflow-y-auto p-4">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.id}>
              {section.label && section.labelIcon && (
                <SectionLabel icon={section.labelIcon} label={section.label} accent={section.accent} />
              )}
              <div className="space-y-1">
                {section.items.map((node) =>
                  isNavGroup(node) ? (
                    <NavGroupBlock
                      key={node.id}
                      group={node}
                      activeView={activeView}
                      isOpen={isGroupOpen(node.id)}
                      onToggle={toggleGroup}
                      onLandingClick={handleGroupLandingClick}
                      onChildClick={handlePrimaryNavClick}
                    />
                  ) : (
                    <PrimaryNavItem
                      key={node.id}
                      item={node}
                      isActive={activeView === node.id}
                      isCollapsed={false}
                      onClick={handlePrimaryNavClick}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="relative z-10 border-t border-line-subtle space-y-4 p-4">
          {/* Credits Display */}
          <div className="p-3 rounded-wzrd-md bg-surface-raised border border-line-subtle">
            <CreditsDisplay showTooltip={false} />
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center justify-center">
            <button 
              onClick={handleLogout}
              className={cn(
                "flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-wzrd-md text-sm",
                "transition-[background-color,color] duration-wzrd-control",
                "text-text-secondary hover:text-status-danger hover:bg-status-danger/10",
                "border border-transparent",
                FOCUS_RING,
              )}
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="whitespace-nowrap">Logout</span>
            </button>
          </div>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
});
