export const EDITOR_ISOLATION_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
] as const;

export const EDITOR_ISOLATION_ROUTE_SOURCES = [
  "/projects/:projectId/editor",
  "/projects/:projectId/editor/:path*",
  "/editor/:projectId",
  "/editor/:projectId/:path*",
  "/video-editor/:projectId",
  "/video-editor/:projectId/:path*",
] as const;

const editorIsolationPathPatterns = [
  /^\/projects\/[^/]+\/editor(?:\/.*)?$/,
  /^\/editor\/[^/]+(?:\/.*)?$/,
  /^\/video-editor\/[^/]+(?:\/.*)?$/,
];

export function isEditorIsolationPath(pathname: string): boolean {
  return editorIsolationPathPatterns.some((pattern) => pattern.test(pathname));
}

export function applyEditorIsolationHeaders(
  setHeader: (key: string, value: string) => void
) {
  EDITOR_ISOLATION_HEADERS.forEach(({ key, value }) => setHeader(key, value));
}
