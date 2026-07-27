import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  buildLoginPath,
  getCanonicalProjectRoute,
  getProjectViewFromPath,
  getRouteEntry,
  getSystemSectionFromLocation,
  getSystemSectionPath,
  isDeferredRoute,
  isRegisteredRoute,
  resolvePostLoginPath,
  sanitizeNextPath,
} from '@/lib/routes';

describe('routes contract', () => {
  it('builds canonical project routes', () => {
    expect(appRoutes.dashboard).toBe('/dashboard');
    expect(appRoutes.dashboardToolkits).toBe('/dashboard/toolkits');
    expect(appRoutes.dashboardSettings).toBe('/dashboard/settings');
    expect(appRoutes.systemAppearance).toBe('/system/appearance');
    expect(appRoutes.systemModels).toBe('/system/models');
    expect(appRoutes.systemBilling).toBe('/system/billing');
    expect(appRoutes.systemBillingDocs).toBe('/system/billing/docs');
    expect(appRoutes.systemIntegrations).toBe('/system/integrations');
    expect(appRoutes.systemApiKeys).toBe('/system/api-keys');
    expect(appRoutes.projects.setup('abc')).toBe('/project-setup?projectId=abc');
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
    expect(isRegisteredRoute('/project-setup/project-1')).toBe(true);
    expect(isRegisteredRoute(appRoutes.systemAppearance)).toBe(true);
    expect(isRegisteredRoute(appRoutes.systemModels)).toBe(true);
    expect(isRegisteredRoute(appRoutes.systemBillingDocs)).toBe(true);
    expect(isRegisteredRoute(appRoutes.systemApiKeys)).toBe(true);
    expect(isRegisteredRoute(appRoutes.ipVault)).toBe(true);
    expect(getRouteEntry(appRoutes.ipVault)?.category).toBe('core');
    expect(getRouteEntry(appRoutes.legacy.ipVault)?.category).toBe('legacy');
    expect(getRouteEntry('/storyboard/project-1')?.category).toBe('legacy');
    expect(isDeferredRoute(appRoutes.deferred.demo)).toBe(true);
    expect(isDeferredRoute(appRoutes.deferred.profile)).toBe(true);
  });

  it('maps System sections to canonical paths', () => {
    expect(getSystemSectionPath('profile')).toBe(appRoutes.system);
    expect(getSystemSectionPath('appearance')).toBe(appRoutes.systemAppearance);
    expect(getSystemSectionPath('models')).toBe(appRoutes.systemModels);
    expect(getSystemSectionPath('billing')).toBe(appRoutes.systemBilling);
    expect(getSystemSectionPath('integrations')).toBe(appRoutes.systemIntegrations);
    expect(getSystemSectionPath('api-keys')).toBe(appRoutes.systemApiKeys);
  });

  it('resolves active System sections from paths and legacy query links', () => {
    expect(getSystemSectionFromLocation(appRoutes.system, '')).toBe('profile');
    expect(getSystemSectionFromLocation(appRoutes.systemAppearance, '')).toBe('appearance');
    expect(getSystemSectionFromLocation(appRoutes.systemModels, '')).toBe('models');
    expect(getSystemSectionFromLocation(appRoutes.systemBilling, '?topup=1')).toBe('billing');
    expect(getSystemSectionFromLocation(appRoutes.systemIntegrations, '')).toBe('integrations');
    expect(getSystemSectionFromLocation(appRoutes.systemApiKeys, '')).toBe('api-keys');
    expect(getSystemSectionFromLocation(appRoutes.system, '?section=appearance')).toBe('appearance');
    expect(getSystemSectionFromLocation('/system/unknown', '')).toBe('profile');
  });
});
