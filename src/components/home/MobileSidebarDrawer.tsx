import { X, ChevronLeft, Settings, HelpCircle, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import CreditsDisplay from '../CreditsDisplay';
import { Badge } from '@/components/ui/badge';
import { appRoutes } from '@/lib/routes';
import {
  SIDEBAR_SECTIONS,
  isNavGroup,
  useNavGroupState,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './navigation';

interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

export const MobileSidebarDrawer = ({ isOpen, onClose, activeView, onViewChange }: MobileSidebarDrawerProps) => {
  const navigate = useNavigate();
  const { isGroupOpen, toggleGroup, openGroup } = useNavGroupState(activeView);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to log out');
    } else {
      toast.success('Logged out successfully');
      navigate('/');
    }
    onClose();
  };

  const handleNavClick = (item: SidebarNavItem) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    } else if (item.isRoute) {
      navigate(item.path ?? appRoutes.kanvas);
    } else {
      onViewChange(item.id);
    }
    onClose();
  };

  const handleGroupLandingClick = (group: SidebarNavGroup) => {
    if (group.landingViewId) {
      openGroup(group.id);
      onViewChange(group.landingViewId);
      onClose();
      return;
    }
    if (group.isRoute || group.externalUrl) {
      handleNavClick(group);
      return;
    }
    toggleGroup(group.id);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-background/80 backdrop-blur-sm z-50 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className={cn(
        "fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] z-[60] md:hidden",
        "bg-card border-r border-border/50 rounded-r-2xl",
        "transform transition-transform duration-300 ease-out",
        "flex flex-col h-full",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted/50 transition-colors z-10"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Workspace Switcher */}
        <div className="p-4 border-b border-border/50 flex-shrink-0">
          <WorkspaceSwitcher />
        </div>

        {/* Navigation — scrollable */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.id}>
              {section.label && section.labelIcon && (
                <div className="flex items-center gap-2 px-3 mb-3">
                  <section.labelIcon className={cn("w-3.5 h-3.5", section.accent ? "text-primary" : "text-muted-foreground/50")} />
                  <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.15em]">{section.label}</span>
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((node) => {
                  const group = isNavGroup(node) ? node : null;
                  const isExpanded = group ? isGroupOpen(group.id) : false;
                  const Icon = node.icon;
                  const isActive = activeView === node.id;

                  return (
                    <div key={node.id}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => (group ? handleGroupLandingClick(group) : handleNavClick(node))}
                          aria-label={node.label}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            "w-full min-h-[44px] flex items-center gap-3 px-3 py-3 rounded-wzrd-md text-sm font-medium",
                            "transition-[background-color,color] duration-wzrd-control",
                            isActive
                              ? "bg-accent-ember/12 text-accent-ember border border-accent-ember/25"
                              : "text-text-secondary hover:text-text-primary hover:bg-accent-air/8 border border-transparent"
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-wzrd-sm flex items-center justify-center",
                            isActive ? "bg-accent-ember/15" : "bg-surface-raised"
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="flex-1 text-left">{node.label}</span>
                          {node.showBadge && (
                            <Badge variant="secondary" className="text-[9px] bg-accent-ember/15 text-accent-ember border-accent-ember/25">
                              New
                            </Badge>
                          )}
                        </button>
                        {group && (
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.id)}
                            aria-label={`Toggle ${group.label} section`}
                            aria-expanded={isExpanded}
                            aria-controls={`mobile-subnav-${group.id}`}
                            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-wzrd-sm text-text-secondary transition-colors duration-wzrd-control hover:text-text-primary"
                          >
                            <ChevronLeft className={cn(
                              "w-4 h-4 transition-transform duration-wzrd-control",
                              isExpanded ? "-rotate-90" : "rotate-0"
                            )} />
                          </button>
                        )}
                      </div>

                      {group && isExpanded && (
                        <div id={`mobile-subnav-${group.id}`} className="mt-1 ml-6 pl-3 border-l border-line-subtle space-y-0.5">
                          {group.children.length === 0 ? (
                            <p className="text-xs text-muted-foreground/50 py-2 italic">{group.emptyLabel}</p>
                          ) : (
                            group.children.map((child) => {
                              const ChildIcon = child.icon;
                              const isChildActive = activeView === child.id;

                              return (
                                <button
                                  key={child.id}
                                  onClick={() => handleNavClick(child)}
                                  aria-label={child.label}
                                  aria-current={isChildActive ? 'page' : undefined}
                                  className={cn(
                                    "w-full min-h-[44px] flex items-center gap-2.5 px-2.5 py-2.5 rounded-wzrd-sm text-sm",
                                    "transition-[background-color,color] duration-wzrd-control",
                                    isChildActive
                                      ? "bg-accent-ember/10 text-accent-ember"
                                      : "text-text-secondary hover:text-text-primary hover:bg-accent-air/8"
                                  )}
                                >
                                  <ChildIcon className="w-4 h-4 flex-shrink-0" />
                                  <span className="flex-1 text-left">{child.label}</span>
                                  {child.showBadge && (
                                    <Badge variant="secondary" className="text-[9px] bg-accent-ember/15 text-accent-ember border-accent-ember/25">
                                      New
                                    </Badge>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Section — always visible */}
        <div className="flex-shrink-0 p-4 border-t border-border/50 bg-card">
          {/* Credits */}
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
            <CreditsDisplay showTooltip={false} />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <Settings className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
