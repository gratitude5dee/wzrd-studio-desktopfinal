export const WZRDCLAW_DASHBOARD_REWRITE_SOURCE = '/dashboard/:path*';

export interface NextRewriteRule {
  source: string;
  destination: string;
}

export function normalizeWzrdclawZoneUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  return parsed.toString().replace(/\/$/, '');
}

export function buildWzrdclawDashboardRewrites(
  zoneUrl: string | undefined = process.env.WZRDCLAW_ZONE_URL
): NextRewriteRule[] {
  const normalizedZoneUrl = normalizeWzrdclawZoneUrl(zoneUrl);
  if (!normalizedZoneUrl) {
    return [];
  }

  return [
    {
      source: WZRDCLAW_DASHBOARD_REWRITE_SOURCE,
      destination: `${normalizedZoneUrl}/dashboard/:path*`,
    },
  ];
}
