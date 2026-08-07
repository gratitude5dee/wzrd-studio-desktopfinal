import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_WEB_PORT || "3300";
const localBaseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e/web",
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || localBaseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: [
          "VITE_USE_MOCK_ASSETS=true",
          "VITE_BYPASS_AUTH_FOR_TESTS=true",
          "NEXT_PUBLIC_USE_MOCK_ASSETS=true",
          "NEXT_PUBLIC_BYPASS_AUTH_FOR_TESTS=true",
          `bun run web:dev -- --hostname 127.0.0.1 --port ${port}`,
        ].join(" "),
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    {
      name: "chromium",
      testIgnore: /pwa-(mobile|production)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /pwa-mobile\.spec\.ts/,
      // iPhone device descriptors default to WebKit; keep their viewport and
      // touch emulation while exercising the installed Chromium binary.
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
