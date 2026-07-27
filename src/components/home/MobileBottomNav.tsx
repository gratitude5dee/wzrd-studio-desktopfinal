import { useLocation, useNavigate } from 'react-router-dom';

import { MOBILE_BOTTOM_NAV_ITEMS, type AppNavItem } from './navConfig';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onCreateProject: () => void;
}

export const MobileBottomNav = ({ activeView, onViewChange, onCreateProject }: MobileBottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleItemClick = (item: AppNavItem) => {
    if (item.isAction) {
      onCreateProject();
    } else if (item.activeViewId) {
      const activeId = item.activeViewId;
      if (location.pathname === '/home') {
        onViewChange(activeId);
      } else {
        navigate('/home', { state: { activeView: activeId } });
      }
    } else if (item.route) {
      if (item.hardNavigate) {
        window.location.assign(item.route);
      } else {
        navigate(item.route);
      }
    } else {
      onViewChange(item.id);
    }
  };

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 md:hidden',
        'border-t border-border/50 bg-card/98 backdrop-blur-2xl',
        'safe-area-inset-bottom',
      )}
      aria-label="Primary mobile navigation"
    >
      <div className="flex h-16 items-center justify-around px-2">
        {MOBILE_BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.isActive?.(location.pathname, activeView, location.search) ?? activeView === item.id;
          const isCreateButton = item.isAction;

          if (isCreateButton) {
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                onClick={() => handleItemClick(item)}
                className={cn(
                  '-mt-6 flex h-14 w-14 flex-col items-center justify-center rounded-full',
                  'bg-gradient-to-br from-[#BEFF00] to-[#9dcc00]',
                  'shadow-[0_4px_20px_rgba(190,255,0,0.4)] ring-4 ring-[rgba(190,255,0,0.2)]',
                  'transition-transform active:scale-95',
                )}
              >
                <Icon className="h-6 w-6 text-primary-foreground" />
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => handleItemClick(item)}
              className={cn(
                'relative flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-3 py-2',
                'transition-all duration-200 active:scale-[0.92]',
                isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
              <span className="text-[10px] font-medium">
                {item.id === 'all' ? 'Projects' : item.label.replace(' with me', '')}
              </span>
              {isActive && <div className="absolute bottom-1.5 h-0.5 w-4 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
