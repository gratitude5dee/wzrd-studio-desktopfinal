import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';

import {
  extractRealtimeClientSecret,
  extractRealtimeExpiresAt,
  extractRealtimeModel,
  extractRealtimeSession,
  fetchRealtimeClientSecret,
} from './realtimeClientSecret';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

// Mock the centralized config so the URL is deterministic
vi.mock('@/integrations/supabase/config', () => ({
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
}));

import { supabase } from '@/integrations/supabase/client';

describe('realtime client secret service', () => {
  it('extracts GA client secrets from current and nested response shapes', () => {
    expect(extractRealtimeClientSecret({ value: 'ek_direct' })).toBe('ek_direct');
    expect(extractRealtimeClientSecret({ client_secret: { value: 'ek_nested' } })).toBe('ek_nested');
  });

  it('extracts the GA realtime session metadata', () => {
    const payload = {
      value: 'ek_test123',
      expires_at: 1781980000,
      session: {
        type: 'realtime',
        model: 'gpt-realtime-2',
      },
    };

    expect(extractRealtimeModel(payload)).toBe('gpt-realtime-2');
    expect(extractRealtimeExpiresAt(payload)).toBe(1781980000);
    expect(extractRealtimeSession(payload)).toMatchObject({ type: 'realtime' });
  });

  describe('fetchRealtimeClientSecret', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('throws when no session is available', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: null },
      });

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('Please sign in');
    });

    it('calls the edge function with the centralized Supabase URL and returns the secret', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ value: 'ek_test123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await fetchRealtimeClientSecret();
      expect(result.clientSecret).toBe('ek_test123');
      expect(result.model).toBeNull();
      expect(result.expiresAt).toBeNull();
      expect(result.session).toBeNull();

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toBe('https://test-project.supabase.co/functions/v1/realtime-client-secret');
      expect((init as RequestInit).headers).toMatchObject({
        Authorization: 'Bearer test-token',
        apikey: 'test-anon-key',
      });
    });

    it('returns the model and expiry from the GA client secret payload', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          value: 'ek_test123',
          expires_at: 1781980000,
          session: { type: 'realtime', model: 'gpt-realtime-2' },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).resolves.toMatchObject({
        clientSecret: 'ek_test123',
        model: 'gpt-realtime-2',
        expiresAt: 1781980000,
        session: { type: 'realtime', model: 'gpt-realtime-2' },
      });
    });

    it('surfaces the real error message from a failed response', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('OPENAI_API_KEY is not configured');
    });

    it('throws a friendly error when a 200 response returns HTML instead of JSON', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<!DOCTYPE html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('received an HTML page');
    });

    it('throws when the response lacks an ephemeral key', async () => {
      (supabase.auth.getSession as Mock).mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ nope: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(fetchRealtimeClientSecret()).rejects.toThrow('ephemeral key');
    });
  });
});
