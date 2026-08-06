import { ChevronLeft, LogOut, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import CreditsDisplay from '../CreditsDisplay';
import { Badge } from '@/components/ui/badge';
import { memo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ShineBorder } from '@/components/ui/shine-border';
import { useSidebar } from '@/contexts/SidebarContext';
import { appRoutes } from '@/lib/routes';
import {
  FLOATING_NAV_ITEMS,
  SIDEBAR_SECTIONS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavGroup,
  type SidebarNavItem,
  type SidebarNavNode,
} from './navigation';
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

const SectionLabel = ({ icon: Icon, label, accent = false }: { icon: LucideIcon; label: string; accent?: boolean }) => (
  <div className="flex items-center gap-2 px-3 mb-3">
    <Icon className={cn("w-3.5 h-3.5", accent ? "text-[#f97316]" : "text-text-tertiary")} />
    <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.15em]">
      {label}
    </span>
  </div>
);

const PrimaryNavItem = memo(function PrimaryNavItem({
  item,
  isActive,
  isCollapsed,
  isOpen,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  isCollapsed: boolean;
  isOpen?: boolean;
  onClick: (item: SidebarNavItem) => void;
}) {
  const Icon = item.icon;

  const content = (
    <motion.button
      whileHover={{ x: isCollapsed ? 0 : 2 }}
      whileTap={{ scale: 0.98 }}
      aria-label={item.label}
      aria-expanded={isOpen}
      onClick={() => onClick(item)}
      className={cn(
        "relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        isCollapsed && "justify-center px-2",
        isActive
          ? "bg-[rgba(249,115,22,0.12)] text-[#f97316] border border-[rgba(249,115,22,0.2)] shadow-sm"
          : "text-text-secondary hover:text-text-primary hover:bg-[rgba(249,115,22,0.06)] dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-white/[0.04]"
      )}
    >
      {isActive && (
        <ShineBorder
          shineColor="#f97316"
          borderWidth={1}
          duration={10}
        />
      )}
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 flex-shrink-0",
        isActive
          ? "bg-[rgba(249,115,22,0.15)] shadow-sm"
          : "bg-surface-2 dark:bg-white/[0.04]"
      )}>
        <Icon className={cn("w-4 h-4", isActive && "text-[#f97316]")} />
      </div>
      {!isCollapsed && (
        <span className="flex-1 text-left whitespace-nowrap">
          {item.label}
        </span>
      )}
      {item.showBadge && !isCollapsed && (
        <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5 font-semibold">
          New
        </Badge>
      )}
      {isOpen !== undefined && !isCollapsed && (
        <ChevronLeft className={cn(
          "w-4 h-4 flex-shrink-0 transition-transform duration-200",
          isOpen ? "-rotate-90" : "rotate-0"
        )} />
      )}
    </motion.button>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          <span className="flex items-center gap-2">
            {item.label}
            {item.showBadge && (
              <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5">
                New
              </Badge>
            )}
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
      onClick={() => onClick(item)}
      className={cn(
        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200",
        isActive
          ? "bg-[rgba(249,115,22,0.1)] text-[#f97316]"
          : "text-text-secondary hover:text-text-primary hover:bg-[rgba(249,115,22,0.06)] dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-white/[0.04]"
      )}
    >
      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-[#f97316]")} />
      <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
      {item.showBadge && (
        <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5 font-semibold">
          New
        </Badge>
      )}
    </button>
  );
});

const FloatingNavButton = memo(function FloatingNavButton({
  item,
  isActive,
  isChild = false,
  onClick,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  isChild?: boolean;
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
          className={cn(
            'relative flex items-center justify-center rounded-lg transition-all duration-200',
            isChild ? 'h-8 w-8' : 'h-10 w-10',
            isActive
              ? 'bg-white/10 text-[#f97316]'
              : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-[#f97316] shadow-[0_0_6px_rgba(249,115,22,0.4)]" />
          )}
          <Icon className={cn(isChild ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="z-[60]">
        <span className="flex items-center gap-2">
          {item.label}
          {item.showBadge && (
            <Badge variant="secondary" className="text-[9px] bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.2)] px-1.5 py-0.5">
              New
            </Badge>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
});

const NavGroupBlock = memo(function NavGroupBlock({
  group,
  activeView,
  isOpen,
  onToggle,
  onChildClick,
}: {
  group: SidebarNavGroup;
  activeView: string;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
  onChildClick: (item: SidebarNavItem) => void;
}) {
  return (
    <div>
      <PrimaryNavItem
        item={group}
        isActive={activeView === group.id}
        isCollapsed={false}
        isOpen={isOpen}
        onClick={() => onToggle(group.id)}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-1 ml-6 pl-3 border-l border-border-default space-y-0.5 dark:border-white/[0.06] overflow-hidden"
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
  const { isGroupOpen, toggleGroup } = useNavGroupState(activeView);
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const navigate = useNavigate();
  const [isFloatingVisible, setIsFloatingVisible] = useState(false);

  // Hover-reveal for collapsed (floating) mode
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isCollapsed) {
      setIsFloatingVisible(e.clientX <= 80);
    }
  }, [isCollapsed]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Reset floating visibility when expanding
  useEffect(() => {
    if (!isCollapsed) setIsFloatingVisible(false);
  }, [isCollapsed]);

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
    if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
    } else {
      onViewChange(item.id);
    }
  }, [navigate, onViewChange]);

  const handleFloatingNavClick = useCallback((node: SidebarNavNode) => {
    if (isNavGroup(node)) {
      toggleGroup(node.id);
      return;
    }
    handlePrimaryNavClick(node);
  }, [handlePrimaryNavClick, toggleGroup]);

  // ── Floating pill (collapsed mode) ──
  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        {/* Invisible hover trigger zone */}
        <div className="fixed left-0 top-[68px] bottom-0 w-[80px] z-[49]" />

        <aside
          className={cn(
            'fixed left-3 top-[calc(50%+34px)] -translate-y-1/2 z-50 flex max-h-[calc(100vh-100px)] flex-col items-center py-3 rounded-2xl',
            'bg-[#0A0A0A]/90 backdrop-blur-xl',
            'shadow-[0_0_15px_rgba(249,115,22,0.15),0_0_30px_rgba(249,115,22,0.05),0_8px_32px_rgba(0,0,0,0.5)]',
            'transition-all duration-300 ease-out',
            isFloatingVisible ? 'w-14 opacity-100 translate-x-0' : 'w-3 opacity-0 -translate-x-2 pointer-events-none overflow-hidden',
          )}
          onMouseEnter={() => setIsFloatingVisible(true)}
          onMouseLeave={() => setIsFloatingVisible(false)}
        >
          {/* Animated orange glow border */}
          <ShineBorder
            shineColor={["#f97316", "#d4a574"]}
            borderWidth={1}
            duration={8}
          />

          {/* Faint orange top-highlight */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-orange-500/5 to-transparent pointer-events-none" />
          {/* Expand button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                aria-label="Expand sidebar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-300"
              >
                <ChevronLeft className="h-[18px] w-[18px] rotate-180" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">Expand sidebar</TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />

          {/* Nav items */}
          <nav className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto hide-scrollbar">
            {FLOATING_NAV_ITEMS.map((entry) => {
              if (entry.kind === 'divider') {
                return <div key={entry.id} className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />;
              }

              const node = entry.node;
              const group = isNavGroup(node) ? node : null;
              const isOpen = group ? isGroupOpen(group.id) : false;

              return (
                <div key={node.id} className="flex shrink-0 flex-col items-center gap-1">
                  <FloatingNavButton
                    item={node}
                    isActive={activeView === node.id}
                    onClick={() => handleFloatingNavClick(node)}
                  />
                  {group && isOpen && group.children.map((child) => (
                    <FloatingNavButton
                      key={child.id}
                      item={child}
                      isActive={activeView === child.id}
                      isChild
                      onClick={() => handlePrimaryNavClick(child)}
                    />
                  ))}
                </div>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="mx-auto my-2 h-px w-6 shrink-0 bg-white/[0.06]" />

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Logout"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="z-[60]">Logout</TooltipContent>
          </Tooltip>

          {/* Brand dot */}
          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-[#f97316]/60 shadow-[0_0_6px_rgba(249,115,22,0.3)]" />
          </div>
        </aside>
      </TooltipProvider>
    );
  }

  // ── Expanded mode (unchanged) ──
  return (
    <TooltipProvider>
      <motion.aside
        variants={SIDEBAR_VARIANTS}
        animate="expanded"
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "h-screen flex flex-col fixed left-0 top-0 z-50 border-r group/sidebar",
          "bg-surface-1 border-border-default",
          "dark:glass-sidebar dark:border-white/[0.04]"
        )}
      >
        {/* Persistent animated orange glow border */}
        <div className="absolute inset-0 opacity-60 group-hover/sidebar:opacity-100 transition-opacity duration-500 pointer-events-none rounded-r-xl overflow-hidden">
          <ShineBorder
            shineColor={["#f97316", "#d4a574"]}
            borderWidth={1}
            duration={8}
          />
        </div>

        {/* Collapse Toggle Button */}
        <motion.button
          onClick={() => setIsCollapsed(true)}
          className="absolute -right-3 top-6 z-50 h-6 w-6 rounded-full bg-surface-1 dark:bg-zinc-800 border border-border-default dark:border-zinc-700 shadow-md flex items-center justify-center hover:bg-surface-2 dark:hover:bg-zinc-700 transition-colors"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.button>

        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-amber-400/5 pointer-events-none dark:from-[rgba(255,107,74,0.04)] dark:to-[rgba(245,158,11,0.02)]" />
        
        {/* Top highlight line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        
        {/* Workspace Switcher */}
        <div className="relative z-10 border-b border-border-default dark:border-white/[0.05] p-4">
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
        <div className="relative z-10 border-t border-border-default space-y-4 dark:border-white/[0.05] p-4">
          {/* Credits Display */}
          <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/10 to-amber-200/30 border border-orange-500/15 backdrop-blur-sm dark:from-[rgba(255,107,74,0.1)] dark:to-[rgba(245,158,11,0.05)] dark:border-[rgba(255,107,74,0.2)]">
            <CreditsDisplay showTooltip={false} />
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center justify-center">
            <button 
              onClick={handleLogout}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                "text-text-secondary hover:text-rose-500 hover:bg-rose-500/10 hover:border-rose-500/20",
                "border border-transparent",
                "dark:text-muted-foreground dark:hover:text-rose-400"
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
