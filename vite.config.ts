import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { vitePluginEditframe } from "@editframe/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// @ts-nocheck
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    vitePluginEditframe({
      root: "./src",
      cacheRoot: "./node_modules/.cache/editframe",
    }) as any,
    mode === 'editframe' &&
    viteSingleFile(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@qcut-app": path.resolve(__dirname, "./src/qcut/app"),
      "@qcut/editor-core": path.resolve(__dirname, "./src/qcut/editor-core"),
      "@qcut/platform-core": path.resolve(__dirname, "./src/qcut/platform/core"),
      "@qcut/platform-web": path.resolve(__dirname, "./src/qcut/platform/web"),
      "@qcut/platform-desktop": path.resolve(__dirname, "./src/qcut/platform/desktop"),
      "react-dnd": path.resolve(__dirname, "./src/lib/react-dnd.tsx"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "framer-motion",
    ],
  },
  // Some editor deps (ex: @babel/* used by Remotion tooling) still reference `process.env`.
  // The renderer runs with Node integration disabled, so we provide a safe empty env object.
  define: {
    'process.env': {},
    // Some deps expect `process.cwd()` even in the browser bundle; handled via src/lib/shims/process.ts.
  },

  optimizeDeps: {
    exclude: ['@sparkjsdev/spark'],
    esbuildOptions: {
      define: {
        'process.env': '{}',
      },
    },
  },
  build: mode === 'editframe'
    ? undefined
    : undefined,
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: false,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "e2e/**",
      "tests/e2e/**",
      "tests/performance.spec.ts",
      "playwright.config.test.ts",
      "supabase/functions/**/*.test.ts",
    ],
  },
}));
