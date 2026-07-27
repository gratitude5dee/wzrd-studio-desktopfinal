import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/integrations/supabase/config';

export interface RealtimeSessionInfo {
  clientSecret: string;
  model: string | null;
  expiresAt: number | null;
  session: Record<string, unknown> | null;
}

export function extractRealtimeClientSecret(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record.value === 'string' && record.value.startsWith('ek_')) {
    return record.value;
  }

  const nested = record.client_secret;
  if (nested && typeof nested === 'object') {
    const value = (nested as Record<string, unknown>).value;
    if (typeof value === 'string' && value.startsWith('ek_')) {
      return value;
    }
  }

  return null;
}

export function extractRealtimeModel(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.model === 'string') return record.model;
  const session = record.session;
  if (session && typeof session === 'object') {
    const model = (session as Record<string, unknown>).model;
    if (typeof model === 'string') return model;
  }
  return null;
}

export function extractRealtimeExpiresAt(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>).expires_at;
  return typeof value === 'number' ? value : null;
}

export function extractRealtimeSession(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const session = (payload as Record<string, unknown>).session;
  return session && typeof session === 'object' ? (session as Record<string, unknown>) : null;
}

/**
 * Safely parse a JSON response, throwing a friendly error when the
 * server returns HTML (e.g. the app's index.html for a bad URL).
 */
async function safeJsonParse(response: Response, label: string): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`${label}: received an HTML page instead of JSON – check the request URL.`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: response is not valid JSON.`);
  }
}

/**
 * Fetches an ephemeral OpenAI Realtime client secret via the
 * `realtime-client-secret` Edge Function.
 *
 * Returns both the ephemeral key and the model that the token was created for,
 * so the client can connect with the matching model.
 */
export async function fetchRealtimeClientSecret(): Promise<RealtimeSessionInfo> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('Please sign in to use voice features.');
  }

  const url = `${SUPABASE_URL}/functions/v1/realtime-client-secret`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    let message = `Voice service error (${response.status})`;
    try {
      const body = await safeJsonParse(response, 'Voice service error');
      if (body && typeof body === 'object' && 'error' in (body as Record<string, unknown>)) {
        const err = (body as Record<string, unknown>).error;
        message = typeof err === 'string' ? err : JSON.stringify(err);
      }
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }

  const payload = await safeJsonParse(response, 'Voice service');
  const secret = extractRealtimeClientSecret(payload);
  if (!secret) {
    throw new Error('Realtime client secret response did not include an ephemeral key.');
  }

  const model = extractRealtimeModel(payload);
  const expiresAt = extractRealtimeExpiresAt(payload);
  const session = extractRealtimeSession(payload);

  return { clientSecret: secret, model, expiresAt, session };
}
