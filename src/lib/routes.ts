export type RouteCategory = 'core' | 'legacy' | 'deferred' | 'support';

export interface RouteManifestEntry {
  id: string;
  pattern: string;
  category: RouteCategory;
}

export const WTR_EXTERNAL_URL = 'https://wtr.wzrd.tech/app';

export const appRoutes = {
  landing: '/',
  login: '/login',
  home: '/home',
  projectSetup: '/project-setup',
  assets: '/assets',
  ipVault: '/ip-vault',
  learningStudio: '/learning-studio',
  storyboardGenerator: '/storyboard-generator',
  kanvas: '/kanvas',
  kanvasLyrics: '/kanvas/lyrics',
  kanvasLyricsNew: '/kanvas/lyrics/new',
  kanvasLyricsTemplate: (templateId: string) => `/kanvas/lyrics/templates/${templateId}`,
  kanvasRemix: '/kanvas/remix',
  kanvasRemixTemplate: (templateId: string) => `/kanvas/remix/${templateId}`,
  kanvasRemixJob: (jobId: string) => `/kanvas/remix/jobs/${jobId}`,
  clipper: '/clipper',
  sourcify: '/sourcify',
  postz: '/postz',
  clipStudio: '/clip-studio',
  settings: {
    root: '/settings',
    billing: '/settings/billing',
    billingDocs: '/settings/billing/docs',
  },
  projects: {
    studio: (projectId: string) => `/projects/${projectId}/studio`,
    timeline: (projectId: string) => `/projects/${projectId}/timeline`,
    editor: (projectId: string) => `/projects/${projectId}/editor`,
    directorsCut: (projectId: string) => `/projects/${projectId}/directors-cut`,
    observability: (projectId: string) => `/projects/${projectId}/observability`,
  },
  legacy: {
    studioProject: (projectId: string) => `/studio/${projectId}`,
    timelineProject: (projectId: string) => `/timeline/${projectId}`,
    timelineDirectorsCut: (projectId: string) => `/timeline/${projectId}/directors-cut`,
    editorProject: (projectId: string) => `/editor/${projectId}`,
    videoEditorProject: (projectId: string) => `/video-editor/${projectId}`,
    storyboardProject: (projectId: string) => `/storyboard/${projectId}`,
    projectTimeline: (projectId: string) => `/project/${projectId}/timeline`,
    studioRoot: '/studio',
    timelineRoot: '/timeline',
    editorRoot: '/editor',
    storyboardRoot: '/storyboard',
    ipVault: '/IPVault',
  },
  deferred: {
    demo: '/demo',
    profile: '/profile',
    auth: '/auth',
    mog: '/mog',
    mogDocs: '/mog/docs',
  },
} as const;

export type CoreProjectView = 'studio' | 'timeline' | 'editor' | 'directors-cut';

export const ROUTE_MANIFEST: RouteManifestEntry[] = [
  { id: 'landing', pattern: appRoutes.landing, category: 'support' },
  { id: 'login', pattern: appRoutes.login, category: 'support' },
  { id: 'home', pattern: appRoutes.home, category: 'core' },
  { id: 'project-setup', pattern: appRoutes.projectSetup, category: 'core' },
  // Legacy Asset Store surface; redirects to /ip-vault.
  { id: 'assets', pattern: appRoutes.assets, category: 'legacy' },
  { id: 'ip-vault', pattern: appRoutes.ipVault, category: 'core' },
  { id: 'learning-studio', pattern: appRoutes.learningStudio, category: 'support' },
  { id: 'storyboard-generator', pattern: appRoutes.storyboardGenerator, category: 'support' },
  { id: 'kanvas', pattern: appRoutes.kanvas, category: 'support' },
  { id: 'kanvas-lyrics', pattern: appRoutes.kanvasLyrics, category: 'support' },
  { id: 'kanvas-lyrics-new', pattern: appRoutes.kanvasLyricsNew, category: 'support' },
  { id: 'kanvas-lyrics-template', pattern: '/kanvas/lyrics/templates/:templateId', category: 'support' },
  { id: 'kanvas-remix', pattern: appRoutes.kanvasRemix, category: 'support' },
  { id: 'kanvas-remix-template', pattern: '/kanvas/remix/:templateId', category: 'support' },
  { id: 'kanvas-remix-job', pattern: '/kanvas/remix/jobs/:jobId', category: 'support' },
  { id: 'clipper', pattern: appRoutes.clipper, category: 'core' },
  { id: 'sourcify', pattern: appRoutes.sourcify, category: 'core' },
  { id: 'postz', pattern: appRoutes.postz, category: 'core' },
  { id: 'clip-studio', pattern: appRoutes.clipStudio, category: 'legacy' },
  { id: 'settings', pattern: appRoutes.settings.root, category: 'core' },
  { id: 'settings-billing', pattern: appRoutes.settings.billing, category: 'core' },
  { id: 'settings-billing-docs', pattern: appRoutes.settings.billingDocs, category: 'core' },
  { id: 'project-studio', pattern: '/projects/:projectId/studio', category: 'core' },
  { id: 'project-timeline', pattern: '/projects/:projectId/timeline', category: 'core' },
  { id: 'project-editor', pattern: '/projects/:projectId/editor', category: 'core' },
  { id: 'project-directors-cut', pattern: '/projects/:projectId/directors-cut', category: 'core' },
  { id: 'project-observability', pattern: '/projects/:projectId/observability', category: 'core' },
  { id: 'legacy-studio-project', pattern: '/studio/:projectId', category: 'legacy' },
  { id: 'legacy-timeline-project', pattern: '/timeline/:projectId', category: 'legacy' },
  { id: 'legacy-timeline-directors-cut', pattern: '/timeline/:projectId/directors-cut', category: 'legacy' },
  { id: 'legacy-editor-project', pattern: '/editor/:projectId', category: 'legacy' },
  { id: 'legacy-video-editor-project', pattern: '/video-editor/:projectId', category: 'legacy' },
  { id: 'legacy-storyboard-project', pattern: '/storyboard/:projectId', category: 'legacy' },
  { id: 'legacy-project-timeline', pattern: '/project/:projectId/timeline', category: 'legacy' },
  { id: 'legacy-studio-root', pattern: appRoutes.legacy.studioRoot, category: 'legacy' },
  { id: 'legacy-timeline-root', pattern: appRoutes.legacy.timelineRoot, category: 'legacy' },
  { id: 'legacy-editor-root', pattern: appRoutes.legacy.editorRoot, category: 'legacy' },
  { id: 'legacy-storyboard-root', pattern: appRoutes.legacy.storyboardRoot, category: 'legacy' },
  { id: 'legacy-ip-vault', pattern: appRoutes.legacy.ipVault, category: 'legacy' },
  { id: 'deferred-demo', pattern: appRoutes.deferred.demo, category: 'deferred' },
  { id: 'deferred-profile', pattern: appRoutes.deferred.profile, category: 'deferred' },
  { id: 'deferred-auth', pattern: appRoutes.deferred.auth, category: 'deferred' },
  { id: 'deferred-mog', pattern: appRoutes.deferred.mog, category: 'deferred' },
  { id: 'deferred-mog-docs', pattern: appRoutes.deferred.mogDocs, category: 'deferred' },
  { id: 'shot-editor', pattern: '/shot-editor/:shotId', category: 'support' },
];

function stripQueryAndHash(path: string) {
  return path.split('#')[0]?.split('?')[0] ?? path;
}

function patternToRegExp(pattern: string) {
  const withParams = pattern.replace(/:([A-Za-z0-9_]+)/g, '__ROUTE_PARAM__');
  const escaped = withParams.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const finalPattern = escaped.replace(/__ROUTE_PARAM__/g, '[^/]+');
  return new RegExp(`^${finalPattern}$`);
}

export function getRouteEntry(path: string): RouteManifestEntry | undefined {
  const normalizedPath = stripQueryAndHash(path);
  return ROUTE_MANIFEST.find((entry) => patternToRegExp(entry.pattern).test(normalizedPath));
}

export function isRegisteredRoute(path: string): boolean {
  return Boolean(getRouteEntry(path));
}

export function isDeferredRoute(path: string): boolean {
  return getRouteEntry(path)?.category === 'deferred';
}

export function getCanonicalProjectRoute(view: CoreProjectView, projectId: string): string {
  switch (view) {
    case 'studio':
      return appRoutes.projects.studio(projectId);
    case 'timeline':
      return appRoutes.projects.timeline(projectId);
    case 'editor':
      return appRoutes.projects.editor(projectId);
    case 'directors-cut':
      return appRoutes.projects.directorsCut(projectId);
  }
}

export function getProjectViewFromPath(pathname: string): CoreProjectView | null {
  const path = stripQueryAndHash(pathname);
  if (patternToRegExp('/projects/:projectId/studio').test(path) || patternToRegExp('/studio/:projectId').test(path)) {
    return 'studio';
  }
  if (
    patternToRegExp('/projects/:projectId/directors-cut').test(path) ||
    patternToRegExp('/timeline/:projectId/directors-cut').test(path)
  ) {
    return 'directors-cut';
  }
  if (patternToRegExp('/projects/:projectId/timeline').test(path) || patternToRegExp('/timeline/:projectId').test(path)) {
    return 'timeline';
  }
  if (
    patternToRegExp('/projects/:projectId/editor').test(path) ||
    patternToRegExp('/editor/:projectId').test(path) ||
    patternToRegExp('/video-editor/:projectId').test(path)
  ) {
    return 'editor';
  }
  return null;
}

export function sanitizeNextPath(candidate?: string | null): string | null {
  if (!candidate || typeof candidate !== 'string') {
    return null;
  }

  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    decoded = candidate;
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) {
    return null;
  }

  return decoded;
}

export function buildLoginPath(next?: string | null): string {
  const sanitizedNext = sanitizeNextPath(next);
  if (!sanitizedNext) {
    return appRoutes.login;
  }

  return `${appRoutes.login}?next=${encodeURIComponent(sanitizedNext)}`;
}

export function resolvePostLoginPath(next?: string | null, fallback: string = appRoutes.home): string {
  return sanitizeNextPath(next) ?? fallback;
}
