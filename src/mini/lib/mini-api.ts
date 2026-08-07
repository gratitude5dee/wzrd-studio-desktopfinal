/**
 * Thin fetch client for the mini-app edge functions.
 *
 * Deliberately does not import `@supabase/supabase-js`: the mini-app route
 * budget (§8) has no room for the full client, and every endpoint it needs is
 * a public edge function.
 */

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://ixkkrousepsiorwlaycp.supabase.co';

export const FUNCTIONS_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;

export interface ArtifactRecord {
  id: string;
  width: number;
  height: number;
  mimeType: string;
  createdAt: string;
  /** Signed URL into the private `artifacts` bucket. */
  url: string;
}

export class MiniApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'MiniApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      `Request failed (${response.status})`;
    throw new MiniApiError(message, response.status);
  }
  return payload as T;
}

export function fetchArtifact(id: string): Promise<ArtifactRecord> {
  return request<ArtifactRecord>(`/mini-artifacts?id=${encodeURIComponent(id)}`);
}

export interface PublishArtifactInput {
  dataUrl: string;
  width: number;
  height: number;
  deviceId: string;
}

export function publishArtifact(input: PublishArtifactInput): Promise<{ id: string }> {
  return request<{ id: string }>('/mini-artifacts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

const DEVICE_ID_KEY = 'wzrd.mini.device-id';

/**
 * Device-scoped anonymous identity. Phase 2 replaces this with the verified
 * `wzrd_uid` claim from the session exchange; until then it is only used to
 * attribute artifacts, never to authorize reads.
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return crypto.randomUUID();
  }
}
