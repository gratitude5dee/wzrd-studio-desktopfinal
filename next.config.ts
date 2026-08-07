import type { NextConfig } from "next";
import path from "node:path";

const legacyViteEnvKeys = [
  "GATSBY_TLDRAW_LICENSE_KEY",
  "NEXT_PUBLIC_TLDRAW_LICENSE_KEY",
  "PUBLIC_TLDRAW_LICENSE_KEY",
  "REACT_APP_TLDRAW_LICENSE_KEY",
  "TLDRAW_LICENSE_KEY",
  "VITE_BYPASS_AUTH_FOR_TESTS",
  "VITE_DEBUG_MODE",
  "VITE_ENABLE_SHOT_STREAM",
  "VITE_ENABLE_STREAM_TELEMETRY",
  "VITE_FAL_API_KEY",
  "VITE_FAL_KEY",
  "VITE_GMI_API_KEY",
  "VITE_IMAROUTER_API_KEY",
  "VITE_LICENSE_SERVER_URL",
  "VITE_MARBLE_API_URL",
  "VITE_MARBLE_WORKSPACE_KEY",
  "VITE_NANO_BANANA_FAST_EDIT_MODEL",
  "VITE_QCUT_LICENSE_SERVER_URL",
  "VITE_RUNWAY_API_KEY",
  "VITE_STORY_AENEID_SPG_NFT_CONTRACT",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_THIRDWEB_CLIENT_ID",
  "VITE_USE_ELECTRON_API",
  "VITE_USE_MOCK_ASSETS",
  "VITE_USE_NEXTJS_ROUTING",
  "VITE_USE_PERF_SHELL",
  "VITE_WZRD_REALTIME_MODEL",
  "VITE_WZRD_REALTIME_VOICE",
] as const;

function publicFallbackFor(key: string): string {
  const publicKey = key.startsWith("VITE_")
    ? key.replace(/^VITE_/, "NEXT_PUBLIC_")
    : key;
  return process.env[publicKey] ?? process.env[key] ?? "";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    const isolationHeaders = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
    ];

    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/projects/:projectId/editor",
        headers: isolationHeaders,
      },
      {
        source: "/projects/:projectId/editor/:path*",
        headers: isolationHeaders,
      },
    ];
  },
  webpack(config, { dev, webpack }) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@sparkjsdev/spark": path.resolve(process.cwd(), "src/next/stubs/spark.ts"),
      "react-dnd": path.resolve(process.cwd(), "src/lib/react-dnd.tsx"),
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };

    const importMetaDefinitions = legacyViteEnvKeys.reduce<Record<string, string>>(
      (env, key) => {
        env[`import.meta.env.${key}`] = JSON.stringify(publicFallbackFor(key));
        return env;
      },
      {
        "import.meta.env.BASE_URL": JSON.stringify("/"),
        "import.meta.env.DEV": JSON.stringify(dev),
        "import.meta.env.PROD": JSON.stringify(!dev),
      }
    );

    config.plugins.push(
      new webpack.DefinePlugin(importMetaDefinitions)
    );

    return config;
  },
};

export default nextConfig;
