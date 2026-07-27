import { appRoutes } from '@/lib/routes';

type EnvLike = Record<string, unknown>;

function getRuntimeEnv(): EnvLike {
  const viteEnv = (import.meta as ImportMeta & { env?: EnvLike }).env;
  if (viteEnv) {
    return viteEnv;
  }

  if (typeof process !== 'undefined') {
    return process.env as EnvLike;
  }

  return {};
}

export interface NavTarget {
  route: string;
  hardNavigate: boolean;
}

export function isEnabledEnvValue(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function isWzrdclawDashboardZoneEnabled(env: EnvLike = getRuntimeEnv()): boolean {
  return (
    isEnabledEnvValue(env.VITE_WZRDCLAW_DASHBOARD_ENABLED) ||
    isEnabledEnvValue(env.NEXT_PUBLIC_WZRDCLAW_DASHBOARD_ENABLED)
  );
}

export function getWzrdosNavTarget(env: EnvLike = getRuntimeEnv()): NavTarget {
  const enabled = isWzrdclawDashboardZoneEnabled(env);
  return {
    route: enabled ? appRoutes.dashboard : appRoutes.wzrdos,
    hardNavigate: enabled,
  };
}
