import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  buildLoginPath,
  getCanonicalProjectRoute,
  getProjectViewFromPath,
  getRouteEntry,
  isDeferredRoute,
  isRegisteredRoute,
  resolvePostLoginPath,
  sanitizeNextPath,
} from '@/lib/routes';

describe('routes contract', () => {
  it('builds canonical project routes', () => {
    expect(getCanonicalProjectRoute('studio', 'abc')).toBe('/projects/abc/studio');
    expect(getCanonicalProjectRoute('timeline', 'abc')).toBe('/projects/abc/timeline');
    expect(getCanonicalProjectRoute('editor', 'abc')).toBe('/projects/abc/editor');
    expect(getCanonicalProjectRoute('directors-cut', 'abc')).toBe('/projects/abc/directors-cut');
  });

  it('resolves canonical views from canonical and legacy paths', () => {
    expect(getProjectViewFromPath('/projects/p1/studio')).toBe('studio');
    expect(getProjectViewFromPath('/studio/p1')).toBe('studio');
    expect(getProjectViewFromPath('/timeline/p1')).toBe('timeline');
    expect(getProjectViewFromPath('/projects/p1/editor')).toBe('editor');
    expect(getProjectViewFromPath('/video-editor/p1')).toBe('editor');
    expect(getProjectViewFromPath('/projects/p1/directors-cut')).toBe('directors-cut');
  });

  it('preserves attempted destinations through login helpers', () => {
    const next = '/projects/project-1/studio?tab=nodes#focus';
    expect(buildLoginPath(next)).toBe(
      `/login?next=${encodeURIComponent(next)}`
    );
    expect(resolvePostLoginPath(next)).toBe(next);
    expect(resolvePostLoginPath(null, appRoutes.home)).toBe(appRoutes.home);
  });

  it('rejects unsafe post-login destinations', () => {
    expect(sanitizeNextPath('https://evil.example')).toBeNull();
    expect(sanitizeNextPath('//evil.example')).toBeNull();
    expect(sanitizeNextPath('projects/project-1/studio')).toBeNull();
  });

  it('registers canonical, legacy, and deferred routes in the manifest', () => {
    expect(isRegisteredRoute('/projects/project-1/timeline')).toBe(true);
    expect(isRegisteredRoute(appRoutes.ipVault)).toBe(true);
    expect(getRouteEntry(appRoutes.ipVault)?.category).toBe('core');
    expect(getRouteEntry(appRoutes.legacy.ipVault)?.category).toBe('legacy');
    expect(getRouteEntry('/storyboard/project-1')?.category).toBe('legacy');
    expect(isDeferredRoute(appRoutes.deferred.demo)).toBe(true);
    expect(isDeferredRoute(appRoutes.deferred.profile)).toBe(true);
  });

  it('registers the settings root alongside its children', () => {
    expect(appRoutes.settings.root).toBe('/settings');
    expect(isRegisteredRoute(appRoutes.settings.root)).toBe(true);
    expect(getRouteEntry(appRoutes.settings.root)?.category).toBe('core');
    expect(getRouteEntry(appRoutes.settings.billing)?.category).toBe('core');
  });

  it('keeps the Asset Store path registered as a legacy redirect', () => {
    expect(isRegisteredRoute(appRoutes.assets)).toBe(true);
    expect(getRouteEntry(appRoutes.assets)?.category).toBe('legacy');
    expect(getRouteEntry(appRoutes.clipStudio)?.category).toBe('legacy');
  });
});
