import { expect, test, type Page } from "@playwright/test";

const canonicalSectionIds = ["top", "studio", "zap", "earth", "air", "coming-soon", "enter"] as const;

const bubbleMenuItems = [
  ["air", "#air"],
  ["studio", "#studio"],
  ["earth", "#earth"],
  ["zap", "https://zap.wzrd.tech"],
  ["fire+water", "#coming-soon"],
  ["enter studio", "https://studio.wzrd.tech/login"],
] as const;

function installConsoleGuards(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/PlatformUnsupportedError|THREE\.Clock|Bundle unpack error/i.test(text)) {
      failures.push(`console ${message.type()}: ${text}`);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.stack || error.message;
    if (/PlatformUnsupportedError|THREE\.Clock|Bundle unpack error/i.test(text)) {
      failures.push(`pageerror: ${text}`);
    }
  });

  return () => {
    expect(failures).toEqual([]);
  };
}

// The landing renders on the server, so its controls only respond once the
// client effects have run and injected the atmosphere engine.
async function waitForLandingHydration(page: Page) {
  await expect(page.locator("script[data-creator-os-fx]")).toHaveCount(2);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mog-intro-seen", "true");
    try {
      window.localStorage.setItem("wzrd-video-intro-seen", "true");
    } catch {
      /* storage unavailable */
    }
  });
});

test("renders the canonical WZRD Creator OS design natively in its source order", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page.locator("iframe")).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
  await expect(page.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle navigation" })).toBeVisible();

  const sectionIds = await page.locator("section[id]").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(sectionIds).toEqual(canonicalSectionIds);

  for (const id of canonicalSectionIds) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }

  await expect(page.getByRole("listbox", { name: "Creator role sphere — drag to rotate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zap is the recipe runtime behind every release." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fire and Water." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Make the next signal" })).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);

  assertNoPlatformUnsupported();
});

test("keeps the supplied bubble navigation while routing Zap and Studio externally", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await waitForLandingHydration(page);

  const menuButton = page.getByRole("button", { name: "Toggle navigation" });
  await menuButton.click();

  for (const [label, href] of bubbleMenuItems) {
    const link = page.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", href);

    if (href.startsWith("https://")) {
      await expect(link).toHaveAttribute("target", "_top");
    }
  }
});

test("retains the canonical responsive runtime without root overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
  await expect(page.getByRole("listbox", { name: "Creator role sphere — drag to rotate" })).toHaveCount(1);
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
});

test("resolves login into an authenticated editor route under test auth", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  await page.goto("/login?next=/projects/demo/editor", { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/projects/demo/editor", { timeout: 45_000 });

  await expect(page.locator(".qcut-root")).toBeVisible();

  assertNoPlatformUnsupported();
});

test("loads and reloads the isolated editor route", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/projects/demo/editor", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");

  await expect(page.locator(".qcut-root")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/projects\/demo\/editor$/);
  await expect(page.locator(".qcut-root")).toBeVisible();

  assertNoPlatformUnsupported();
});
