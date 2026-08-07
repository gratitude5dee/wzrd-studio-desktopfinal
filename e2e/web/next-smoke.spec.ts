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

function canonicalFrame(page: Page) {
  return page.frameLocator('iframe[title="WZRD Creator OS"]');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mog-intro-seen", "true");
  });
});

test("renders the supplied canonical WZRD Creator OS bundle in its source order", async ({ page }) => {
  const assertNoPlatformUnsupported = installConsoleGuards(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  const iframe = page.locator('iframe[title="WZRD Creator OS"]');
  await expect(iframe).toBeVisible();

  const frame = canonicalFrame(page);
  await expect(frame.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeVisible();
  await expect(frame.getByRole("link", { name: "WZRD.tech home" })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Toggle navigation" })).toBeVisible();

  const sectionIds = await frame.locator("section[id]").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(sectionIds).toEqual(canonicalSectionIds);

  for (const id of canonicalSectionIds) {
    await expect(frame.locator(`section#${id}`)).toHaveCount(1);
  }

  await expect(frame.getByRole("listbox", { name: "Creator role sphere — drag to rotate" })).toBeVisible();
  await expect(frame.getByRole("heading", { name: "Zap is the recipe runtime behind every release." })).toBeVisible();
  await expect(frame.getByRole("heading", { name: "Fire and Water." })).toBeVisible();
  await expect(frame.getByRole("link", { name: "Make the next signal" })).toBeVisible();
  expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);

  assertNoPlatformUnsupported();
});

test("keeps the supplied bubble navigation while routing Zap and Studio externally", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const frame = canonicalFrame(page);
  const menuButton = frame.getByRole("button", { name: "Toggle navigation" });
  await menuButton.click();

  for (const [label, href] of bubbleMenuItems) {
    const link = frame.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", href);

    if (href.startsWith("https://")) {
      await expect(link).toHaveAttribute("target", "_top");
    }
  }
});

test("retains the canonical responsive runtime without root overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const frame = canonicalFrame(page);
  await expect(frame.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeVisible();
  await expect(frame.getByRole("listbox", { name: "Creator role sphere — drag to rotate" })).toHaveCount(1);
  expect(await frame.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
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
