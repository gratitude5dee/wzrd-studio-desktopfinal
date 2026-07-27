import { describe, expect, it } from 'vitest';

import {
  WZRDCLAW_DASHBOARD_REWRITE_SOURCE,
  buildWzrdclawDashboardRewrites,
  normalizeWzrdclawZoneUrl,
} from '../wzrdclawRewrites';

describe('wzrdclaw dashboard rewrites', () => {
  it('normalizes valid zone URLs and strips a trailing slash', () => {
    expect(normalizeWzrdclawZoneUrl(' https://wzrdclaw.vercel.app/ ')).toBe(
      'https://wzrdclaw.vercel.app'
    );
    expect(normalizeWzrdclawZoneUrl('http://localhost:3001')).toBe('http://localhost:3001');
  });

  it('ignores missing, malformed, or non-http zone URLs', () => {
    expect(normalizeWzrdclawZoneUrl()).toBeNull();
    expect(normalizeWzrdclawZoneUrl('')).toBeNull();
    expect(normalizeWzrdclawZoneUrl('wzrdclaw.vercel.app')).toBeNull();
    expect(normalizeWzrdclawZoneUrl('javascript:alert(1)')).toBeNull();
  });

  it('builds an env-gated dashboard multi-zone rewrite', () => {
    expect(buildWzrdclawDashboardRewrites('')).toEqual([]);
    expect(buildWzrdclawDashboardRewrites('https://wzrdclaw.vercel.app/')).toEqual([
      {
        source: WZRDCLAW_DASHBOARD_REWRITE_SOURCE,
        destination: 'https://wzrdclaw.vercel.app/dashboard/:path*',
      },
    ]);
  });
});
