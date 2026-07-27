import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { appRoutes } from '@/lib/routes';

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar-collapsed:v2';
const LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEYS = [
  'sidebar-collapsed',
  'wzrd:sidebar-collapsed:v2',
  'wzrd:sidebar-collapsed:v3',
] as const;
export const APP_SIDEBAR_EXPANDED_WIDTH = 256;
export const APP_SIDEBAR_COLLAPSED_WIDTH = 0;
export type SidebarMode = 'expanded' | 'hidden';

interface PersistedSidebarState {
  global: boolean;
  overrides: Record<string, boolean>;
}

function isDefaultCollapsedRoute(pathname: string): boolean {
  return pathname === appRoutes.projectSetup || pathname.startsWith(`${appRoutes.projectSetup}/`);
}

function coercePersistedState(value: string | null): PersistedSidebarState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'boolean') {
      return { global: parsed, overrides: {} };
    }

    if (parsed && typeof parsed === 'object') {
      const global = typeof parsed.global === 'boolean' ? parsed.global : false;
      const overrides =
        parsed.overrides && typeof parsed.overrides === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.overrides).filter((entry): entry is [string, boolean] => (
                typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
              )),
            )
          : {};

      return { global, overrides };
    }
  } catch {
    if (value === 'true' || value === 'false') {
      return { global: value === 'true', overrides: {} };
    }
  }

  return null;
}

function readPersistedCollapsedState(): PersistedSidebarState {
  if (typeof window === 'undefined') {
    return { global: false, overrides: {} };
  }

  const current = coercePersistedState(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY));
  if (current) {
    return current;
  }

  for (const key of LEGACY_SIDEBAR_COLLAPSED_STORAGE_KEYS) {
    const legacy = coercePersistedState(window.localStorage.getItem(key));
    if (legacy) {
      return legacy;
    }
  }

  return { global: false, overrides: {} };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

interface SidebarContextType {
  isCollapsed: boolean;
  mode: SidebarMode;
  offset: number;
  peekVisible: boolean;
  setIsCollapsed: (value: boolean) => void;
  setPeekVisible: (value: boolean) => void;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  mode: 'expanded',
  offset: APP_SIDEBAR_EXPANDED_WIDTH,
  peekVisible: false,
  setIsCollapsed: () => {},
  setPeekVisible: () => {},
  toggleCollapsed: () => {},
});

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [collapsedState, setCollapsedState] = useState(readPersistedCollapsedState);
  const [peekVisible, setPeekVisible] = useState(false);
  const routeKey = location.pathname;
  const isCollapsed = collapsedState.overrides[routeKey] ?? (
    isDefaultCollapsedRoute(routeKey) ? true : collapsedState.global
  );
  const mode: SidebarMode = isCollapsed ? 'hidden' : 'expanded';
  const offset = isCollapsed ? APP_SIDEBAR_COLLAPSED_WIDTH : APP_SIDEBAR_EXPANDED_WIDTH;

  useEffect(() => {
    if (!isCollapsed) {
      setPeekVisible(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedState));
    } catch {
      // Persistence is an enhancement; the app shell should still render without storage.
    }
  }, [collapsedState]);

  const setIsCollapsed = useCallback((value: boolean) => {
    setCollapsedState((current) => {
      const overrides = { ...current.overrides };

      if (isDefaultCollapsedRoute(routeKey)) {
        overrides[routeKey] = value;
        return {
          global: current.global,
          overrides,
        };
      }

      delete overrides[routeKey];
      return {
        global: value,
        overrides,
      };
    });
  }, [routeKey]);

  const toggleCollapsed = useCallback(() => setIsCollapsed(!isCollapsed), [isCollapsed, setIsCollapsed]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isLegacyToggle = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b';
      const isBracketToggle = !event.metaKey && !event.ctrlKey && !event.altKey && event.key === '[';

      if ((isLegacyToggle || isBracketToggle) && !isEditableTarget(event.target)) {
        event.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

  const value = useMemo(() => ({
    isCollapsed,
    mode,
    offset,
    peekVisible,
    setIsCollapsed,
    setPeekVisible,
    toggleCollapsed,
  }), [
    isCollapsed,
    mode,
    offset,
    peekVisible,
    setIsCollapsed,
    setPeekVisible,
    toggleCollapsed,
  ]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => useContext(SidebarContext);
