import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PWA_PORT || "3401";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e/web",
  testMatch: "pwa-production.spec.ts",
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run web:start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
});
