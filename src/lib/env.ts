type EnvValue = string | boolean | undefined;

const vitePublicEnv: Record<string, EnvValue> = {
  BASE_URL: import.meta.env.BASE_URL,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
  GATSBY_TLDRAW_LICENSE_KEY: import.meta.env.GATSBY_TLDRAW_LICENSE_KEY,
  NEXT_PUBLIC_TLDRAW_LICENSE_KEY: import.meta.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY,
  PUBLIC_TLDRAW_LICENSE_KEY: import.meta.env.PUBLIC_TLDRAW_LICENSE_KEY,
  REACT_APP_TLDRAW_LICENSE_KEY: import.meta.env.REACT_APP_TLDRAW_LICENSE_KEY,
  TLDRAW_LICENSE_KEY: import.meta.env.TLDRAW_LICENSE_KEY,
  VITE_BYPASS_AUTH_FOR_TESTS: import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS,
  VITE_DEBUG_MODE: import.meta.env.VITE_DEBUG_MODE,
  VITE_ENABLE_SHOT_STREAM: import.meta.env.VITE_ENABLE_SHOT_STREAM,
  VITE_ENABLE_STREAM_TELEMETRY: import.meta.env.VITE_ENABLE_STREAM_TELEMETRY,
  VITE_FAL_API_KEY: import.meta.env.VITE_FAL_API_KEY,
  VITE_FAL_KEY: import.meta.env.VITE_FAL_KEY,
  VITE_GMI_API_KEY: import.meta.env.VITE_GMI_API_KEY,
  VITE_IMAROUTER_API_KEY: import.meta.env.VITE_IMAROUTER_API_KEY,
  VITE_LICENSE_SERVER_URL: import.meta.env.VITE_LICENSE_SERVER_URL,
  VITE_MARBLE_API_URL: import.meta.env.VITE_MARBLE_API_URL,
  VITE_MARBLE_WORKSPACE_KEY: import.meta.env.VITE_MARBLE_WORKSPACE_KEY,
  VITE_NANO_BANANA_FAST_EDIT_MODEL: import.meta.env.VITE_NANO_BANANA_FAST_EDIT_MODEL,
  VITE_QCUT_LICENSE_SERVER_URL: import.meta.env.VITE_QCUT_LICENSE_SERVER_URL,
  VITE_RUNWAY_API_KEY: import.meta.env.VITE_RUNWAY_API_KEY,
  VITE_STORY_AENEID_SPG_NFT_CONTRACT: import.meta.env.VITE_STORY_AENEID_SPG_NFT_CONTRACT,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_THIRDWEB_CLIENT_ID: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
  VITE_USE_ELECTRON_API: import.meta.env.VITE_USE_ELECTRON_API,
  VITE_USE_MOCK_ASSETS: import.meta.env.VITE_USE_MOCK_ASSETS,
  VITE_USE_NEXTJS_ROUTING: import.meta.env.VITE_USE_NEXTJS_ROUTING,
  VITE_USE_PERF_SHELL: import.meta.env.VITE_USE_PERF_SHELL,
  VITE_WZRD_REALTIME_MODEL: import.meta.env.VITE_WZRD_REALTIME_MODEL,
  VITE_WZRD_REALTIME_VOICE: import.meta.env.VITE_WZRD_REALTIME_VOICE,
};

function clean(value: EnvValue): string | undefined {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (!value || value === "undefined" || value === "null") return undefined;
  return value;
}

function readProcessEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return clean(process.env?.[key]);
}

function readViteEnv(key: string): string | undefined {
  return clean(vitePublicEnv[key]);
}

export function readPublicEnv(publicName: string, legacyNames: string[] = []): string | undefined {
  const names = [
    publicName.startsWith("NEXT_PUBLIC_") ? publicName : `NEXT_PUBLIC_${publicName}`,
    ...legacyNames,
    publicName,
  ];

  for (const name of names) {
    const value = readProcessEnv(name) ?? readViteEnv(name);
    if (value) return value;
  }

  return undefined;
}

export function readPublicFlag(
  publicName: string,
  legacyNames: string[] = [],
  fallback = false
): boolean {
  const value = readPublicEnv(publicName, legacyNames);
  if (value === undefined) return fallback;
  return value === "true";
}
