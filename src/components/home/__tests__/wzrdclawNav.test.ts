import { describe, expect, it } from 'vitest';

import {
  getWzrdosNavTarget,
  isEnabledEnvValue,
  isWzrdclawDashboardZoneEnabled,
} from '../wzrdclawNav';

describe('wzrdclaw nav targeting', () => {
  it('recognizes common enabled flag values', () => {
    expect(isEnabledEnvValue('true')).toBe(true);
    expect(isEnabledEnvValue('1')).toBe(true);
    expect(isEnabledEnvValue('YES')).toBe(true);
    expect(isEnabledEnvValue('on')).toBe(true);
    expect(isEnabledEnvValue('false')).toBe(false);
    expect(isEnabledEnvValue(undefined)).toBe(false);
  });

  it('supports either Vite or Next public dashboard-zone flags', () => {
    expect(isWzrdclawDashboardZoneEnabled({ VITE_WZRDCLAW_DASHBOARD_ENABLED: 'true' })).toBe(true);
    expect(isWzrdclawDashboardZoneEnabled({ NEXT_PUBLIC_WZRDCLAW_DASHBOARD_ENABLED: 'true' })).toBe(true);
    expect(isWzrdclawDashboardZoneEnabled({ NEXT_PUBLIC_WZRDCLAW_DASHBOARD_ENABLED: 'false' })).toBe(false);
  });

  it('keeps local WZRDOS by default and hard-navigates to dashboard when enabled', () => {
    expect(getWzrdosNavTarget({})).toEqual({
      route: '/wzrdos',
      hardNavigate: false,
    });
    expect(getWzrdosNavTarget({ VITE_WZRDCLAW_DASHBOARD_ENABLED: 'true' })).toEqual({
      route: '/dashboard',
      hardNavigate: true,
    });
  });
});
