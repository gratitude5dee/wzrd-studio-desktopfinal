import {
  CalendarDays,
  Coins,
  Command,
  DatabaseZap,
  FolderKanban,
  Globe,
  Images,
  Layers,
  Link2,
  LogOut,
  Plus,
  Scissors,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { KANVAS_LYRICS_NAV_ITEM, KANVAS_STUDIO_NAV } from '@/components/kanvas/studioNavConfig';
import { appRoutes } from '@/lib/routes';
import { getWzrdosNavTarget } from './wzrdclawNav';

export type AppNavSection = 'studio' | 'collaborate' | 'system' | 'action';
export type AppNavMobilePlacement = 'drawer' | 'bottom' | 'both' | 'none';
export type AppNavKind = 'item' | 'group';

export interface AppNavItem {
  id: string;
  label: string;
  route?: string;
  icon: LucideIcon;
  section: AppNavSection;
  mobilePlacement: AppNavMobilePlacement;
  kind?: AppNavKind;
  children?: AppNavItem[];
  activeViewId?: string;
  showBadge?: boolean;
  featureFlag?: string;
  hardNavigate?: boolean;
  isAction?: boolean;
  isActive?: (pathname: string, activeView: string, search?: string) => boolean;
}

function activeViewMatches(item: Pick<AppNavItem, 'id' | 'activeViewId'>, activeView: string) {
  const activeId = item.activeViewId ?? item.id;
  return (activeId === 'all' && !activeView) || activeView === activeId;
}

function routeMatches(route: string | undefined, pathname: string, search = '') {
  if (!route) return false;

  const [routePath, routeSearch] = route.split('?');
  const isPathMatch = pathname === routePath || pathname.startsWith(`${routePath}/`);
  if (!isPathMatch) return false;
  if (!routeSearch) return true;

  const expectedSearch = new URLSearchParams(routeSearch);
  const actualSearch = new URLSearchParams(search);
  return Array.from(expectedSearch.entries()).every(([key, value]) => actualSearch.get(key) === value);
}

function itemActive(item: Pick<AppNavItem, 'id' | 'activeViewId'> & { route?: string }, pathname: string, activeView: string, search?: string) {
  const activeId = item.activeViewId ?? item.id;
  if (activeView && activeView === activeId) return true;

  if (item.route === appRoutes.home) {
    return activeViewMatches(item, activeView);
  }

  return routeMatches(item.route, pathname, search);
}

export function mergeNavRouteSearch(route: string, currentSearch = '') {
  if (!route.includes('?')) return route;

  const [routePath, routeSearch] = route.split('?');
  const mergedSearch = new URLSearchParams(currentSearch);
  new URLSearchParams(routeSearch).forEach((value, key) => mergedSearch.set(key, value));
  const query = mergedSearch.toString();
  return query ? `${routePath}?${query}` : routePath;
}

function groupActive(item: Pick<AppNavItem, 'route' | 'children'>, pathname: string, activeView: string, search?: string) {
  return Boolean(
    routeMatches(item.route, pathname, search) ||
      item.children?.some((child) => child.isActive?.(pathname, activeView, search)),
  );
}

const wzrdosNavTarget = getWzrdosNavTarget();

const homeView = (id: string, label: string, icon: LucideIcon): AppNavItem => ({
  id,
  label,
  route: appRoutes.home,
  icon,
  section: 'studio',
  mobilePlacement: 'drawer',
  activeViewId: id,
  isActive: (pathname, activeView, search) =>
    itemActive({ id, activeViewId: id, route: appRoutes.home }, pathname, activeView, search),
});

const kanvasChildren: AppNavItem[] = [
  ...KANVAS_STUDIO_NAV.map((item) => ({
    id: `kanvas-${item.key}`,
    label: item.label,
    route: `${appRoutes.kanvas}?studio=${encodeURIComponent(item.queryValue)}`,
    icon: item.Icon,
    section: 'studio' as const,
    mobilePlacement: 'drawer' as const,
    isActive: (pathname: string, activeView: string, search?: string) =>
      itemActive(
        {
          id: `kanvas-${item.key}`,
          route: `${appRoutes.kanvas}?studio=${encodeURIComponent(item.queryValue)}`,
        },
        pathname,
        activeView,
        search,
      ),
  })),
  {
    id: 'kanvas-lyrics',
    label: KANVAS_LYRICS_NAV_ITEM.label,
    route: KANVAS_LYRICS_NAV_ITEM.routeOverride,
    icon: KANVAS_LYRICS_NAV_ITEM.Icon,
    section: 'studio',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive(
        { id: 'kanvas-lyrics', route: KANVAS_LYRICS_NAV_ITEM.routeOverride },
        pathname,
        activeView,
        search,
      ),
  },
];

const studioChildren: AppNavItem[] = [
  homeView('all', 'All Projects', FolderKanban),
  homeView('asset-store', 'Asset Store', Images),
  homeView('aura', 'Aura', Sparkles),
];

const collaborationItems: AppNavItem[] = [
  {
    id: 'creative-intelligence',
    label: 'Creative Intelligence',
    route: appRoutes.creativeIntelligence,
    icon: Sparkles,
    section: 'collaborate',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'creative-intelligence', route: appRoutes.creativeIntelligence }, pathname, activeView, search),
  },
  {
    id: 'shared',
    label: 'Shared with me',
    icon: Users,
    section: 'collaborate',
    mobilePlacement: 'both',
    activeViewId: 'shared',
    isActive: (pathname, activeView) => activeViewMatches({ id: 'shared' }, activeView) && pathname === appRoutes.home,
  },
  {
    id: 'community',
    label: 'Community',
    icon: Globe,
    section: 'collaborate',
    mobilePlacement: 'drawer',
    activeViewId: 'community',
    isActive: (pathname, activeView) => activeViewMatches({ id: 'community' }, activeView) && pathname === appRoutes.home,
  },
];

const sourcifyItem: AppNavItem = {
  id: 'sourcify',
  label: 'Sourcify',
  route: appRoutes.sourcify,
  icon: DatabaseZap,
  section: 'studio',
  mobilePlacement: 'drawer',
  showBadge: true,
  isActive: (pathname, activeView, search) =>
    itemActive({ id: 'sourcify', route: appRoutes.sourcify }, pathname, activeView, search),
};

const clipperChildren: AppNavItem[] = [sourcifyItem];

const settingsChildren: AppNavItem[] = [
  {
    id: 'integrations',
    label: 'Integrations',
    route: appRoutes.systemIntegrations,
    icon: Link2,
    section: 'system',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'integrations', route: appRoutes.systemIntegrations }, pathname, activeView, search),
  },
];

export const PRIMARY_NAV_TREE: AppNavItem[] = [
  {
    id: 'wzrdos',
    label: 'WZRDOS',
    route: wzrdosNavTarget.route,
    icon: Command,
    section: 'studio',
    mobilePlacement: 'drawer',
    showBadge: true,
    hardNavigate: wzrdosNavTarget.hardNavigate,
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'wzrdos', route: wzrdosNavTarget.route }, pathname, activeView, search),
  },
  {
    id: 'studio',
    label: 'Studio',
    icon: Sparkles,
    kind: 'group',
    section: 'studio',
    mobilePlacement: 'drawer',
    children: studioChildren,
    isActive: (pathname, activeView, search) => groupActive({ children: studioChildren }, pathname, activeView, search),
  },
  {
    id: 'kanvas',
    label: 'Kanvas',
    route: appRoutes.kanvas,
    icon: Layers,
    kind: 'group',
    section: 'studio',
    mobilePlacement: 'both',
    showBadge: true,
    children: kanvasChildren,
    isActive: (pathname, activeView, search) =>
      groupActive({ route: appRoutes.kanvas, children: kanvasChildren }, pathname, activeView, search),
  },
  {
    id: 'ip-vault',
    label: 'IP Vault',
    route: appRoutes.ipVault,
    icon: ShieldCheck,
    section: 'studio',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'ip-vault', route: appRoutes.ipVault }, pathname, activeView, search),
  },
  {
    id: 'clipper',
    label: 'Clipper',
    route: appRoutes.clipper,
    icon: Scissors,
    kind: 'group',
    section: 'studio',
    mobilePlacement: 'both',
    showBadge: true,
    children: clipperChildren,
    isActive: (pathname, activeView, search) =>
      groupActive({ route: appRoutes.clipper, children: clipperChildren }, pathname, activeView, search),
  },
  {
    id: 'postz',
    label: 'Postz',
    route: appRoutes.postz,
    icon: CalendarDays,
    section: 'studio',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'postz', route: appRoutes.postz }, pathname, activeView, search),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    kind: 'group',
    section: 'system',
    mobilePlacement: 'drawer',
    children: settingsChildren,
    isActive: (pathname, activeView, search) =>
      groupActive({ route: appRoutes.system, children: settingsChildren }, pathname, activeView, search),
  },
  ...collaborationItems,
  {
    id: 'credits',
    label: 'Credits',
    route: appRoutes.systemBilling,
    icon: Coins,
    section: 'system',
    mobilePlacement: 'drawer',
    isActive: (pathname, activeView, search) =>
      itemActive({ id: 'credits', route: appRoutes.systemBilling }, pathname, activeView, search),
  },
  {
    id: 'logout',
    label: 'Logout',
    icon: LogOut,
    section: 'system',
    mobilePlacement: 'drawer',
    isAction: true,
  },
  {
    id: 'create',
    label: 'Create',
    icon: Plus,
    section: 'action',
    mobilePlacement: 'bottom',
    isAction: true,
  },
];

function flattenNavItems(items: AppNavItem[]): AppNavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenNavItems(item.children) : [])]);
}

export const APP_NAV_ITEMS = flattenNavItems(PRIMARY_NAV_TREE);
export const STUDIO_NAV_ITEMS = PRIMARY_NAV_TREE.filter((item) => item.section === 'studio');
export const SYSTEM_NAV_ITEMS = PRIMARY_NAV_TREE.filter((item) => item.section === 'system');
export const MAIN_NAV_ITEMS = STUDIO_NAV_ITEMS;
export const FLOATING_APP_RAIL_ITEMS = PRIMARY_NAV_TREE.filter((item) => item.section !== 'action');
export const SECONDARY_NAV_ITEMS = collaborationItems;
export const MOBILE_DRAWER_NAV_ITEMS = APP_NAV_ITEMS.filter(
  (item) => item.mobilePlacement === 'drawer' || item.mobilePlacement === 'both',
);

const MOBILE_BOTTOM_ORDER = ['all', 'kanvas', 'create', 'clipper', 'shared'];

export const MOBILE_BOTTOM_NAV_ITEMS = MOBILE_BOTTOM_ORDER.map((id) =>
  APP_NAV_ITEMS.find((item) => item.id === id),
).filter((item): item is AppNavItem => Boolean(item));

export const HOME_NAV_VIEW_IDS = new Set(
  APP_NAV_ITEMS.filter((item) => !item.isAction && !item.children).map((item) => item.activeViewId ?? item.id),
);
