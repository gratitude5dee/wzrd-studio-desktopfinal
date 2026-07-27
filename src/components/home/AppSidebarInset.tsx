import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import {
  APP_SIDEBAR_COLLAPSED_WIDTH,
  APP_SIDEBAR_EXPANDED_WIDTH,
  useSidebar,
} from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';

interface AppSidebarInsetProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'main';
  children: ReactNode;
}

export function AppSidebarInset({
  as = 'div',
  children,
  className,
  style,
  ...props
}: AppSidebarInsetProps) {
  const { isCollapsed, offset } = useSidebar();
  const sidebarOffset =
    typeof offset === 'number'
      ? offset
      : isCollapsed
        ? APP_SIDEBAR_COLLAPSED_WIDTH
        : APP_SIDEBAR_EXPANDED_WIDTH;
  const insetStyle = {
    ...style,
    '--app-sidebar-offset': `${sidebarOffset}px`,
  } as CSSProperties;
  const insetClassName = cn(
    'min-w-0 transition-[margin-left] duration-300 ease-out md:ml-[var(--app-sidebar-offset)]',
    className,
  );

  if (as === 'main') {
    return (
      <main className={insetClassName} style={insetStyle} {...props}>
        {children}
      </main>
    );
  }

  return (
    <div className={insetClassName} style={insetStyle} {...props}>
      {children}
    </div>
  );
}
