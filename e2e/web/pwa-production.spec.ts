import { expect, test } from "@playwright/test";

test("publishes installable WZRD metadata from the production output", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);

  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    display: "standalone",
    id: "/",
    scope: "/",
    short_name: "WZRD",
    start_url: "/",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sizes: "192x192",
        src: "/brand/wzrd-icon-192.png",
        type: "image/png",
      }),
      expect.objectContaining({
        sizes: "512x512",
        src: "/brand/wzrd-icon-512.png",
        type: "image/png",
      }),
      expect.objectContaining({
        purpose: "maskable",
        sizes: "512x512",
        src: "/brand/wzrd-icon-maskable-512.png",
        type: "image/png",
      }),
    ]),
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/brand/wzrd-icon-180.png",
  );
});

test("reopens the public Creator OS shell offline after its first production load", async ({
  context,
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('iframe[title="WZRD Creator OS"]')).toBeVisible();

  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toMatch(/\/$/);

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  const frame = page.frameLocator('iframe[title="WZRD Creator OS"]');
  await expect(frame.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeVisible();

  await context.setOffline(false);
});
