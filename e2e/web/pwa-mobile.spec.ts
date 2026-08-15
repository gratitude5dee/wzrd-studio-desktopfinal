import { expect, test, type Page } from "@playwright/test";

const iconSpecs = [
  { path: "/brand/wzrd-icon-16.png", size: 16 },
  { path: "/brand/wzrd-icon-32.png", size: 32 },
  { path: "/brand/wzrd-icon-48.png", size: 48 },
  { path: "/brand/wzrd-icon-180.png", size: 180 },
  { path: "/brand/wzrd-icon-192.png", size: 192 },
  { path: "/brand/wzrd-icon-512.png", size: 512 },
  { path: "/brand/wzrd-icon-maskable-512.png", size: 512 },
] as const;

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
] as const;

function pngDimensions(bytes: Buffer) {
  expect(bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);

  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

// The landing renders on the server, so its controls only respond once the
// client effects have run and injected the atmosphere engine.
async function waitForLandingHydration(page: Page) {
  await expect(page.locator("script[data-creator-os-fx]")).toHaveCount(2);
}

test.beforeEach(async ({ page }) => {
  // Skip the first-visit intro overlay so the landing itself is under test.
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mog-intro-seen", "true");
    try {
      window.localStorage.setItem("wzrd-video-intro-seen", "true");
    } catch {
      /* storage unavailable */
    }
  });
});

test("publishes a complete WZRD manifest and route-level icon metadata", async ({ page, request }) => {
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
      expect.objectContaining({ src: "/brand/wzrd-icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/brand/wzrd-icon-512.png", sizes: "512x512", type: "image/png" }),
      expect.objectContaining({
        src: "/brand/wzrd-icon-maskable-512.png",
        sizes: "512x512",
        purpose: "maskable",
        type: "image/png",
      }),
    ]),
  );

  for (const { path, size } of iconSpecs) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const dimensions = pngDimensions(await response.body());
    expect(dimensions).toEqual({ height: size, width: size });
  }

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image");

  for (const route of ["/", "/login", "/studio"]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    const metadata = await page.locator("head").evaluate((head) =>
      Array.from(head.querySelectorAll("link[rel]")).map((link) => ({
        href: link.getAttribute("href"),
        rel: link.getAttribute("rel"),
      })),
    );

    expect(metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "manifest", href: "/manifest.webmanifest" }),
        expect.objectContaining({ rel: "apple-touch-icon", href: "/brand/wzrd-icon-180.png" }),
      ]),
    );
    expect(metadata.some((link) => link.rel === "icon" && link.href?.includes("wzrd-icon-32.png"))).toBe(true);
  }
});

test("stops serving the superseded standalone Creator OS bundle", async ({ page, request }) => {
  const response = await request.get("/creator-os/wzrd-creator-os-newdesign.html");
  expect(response.status()).toBe(404);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("iframe")).toHaveCount(0);
});

for (const viewport of mobileViewports) {
  test(`keeps every Creator OS chapter visible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();

    for (const id of ["studio", "zap", "earth", "air"]) {
      const section = page.locator(`section#${id}`);
      await expect(section).toHaveCount(1);
      const geometry = await section.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    }

    expect(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("listbox", { name: "Creator role sphere — drag to rotate" })).toBeVisible();
  });
}

test("makes Motion reachable on touch and renders mobile effects calmly", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await waitForLandingHydration(page);

  const motion = page.getByRole("button", { name: "Toggle motion" });
  await expect(motion).toHaveCount(1);
  await expect(motion).toBeVisible();

  const sky = page.locator("wz-sky");
  expect(await sky.count()).toBe(1);
  await expect.poll(async () => sky.getAttribute("mode")).toBe("calm");
  await expect(page.locator("#top [data-creator-os]")).toBeVisible();
  await expect(page.locator("#top wz-trail")).toBeHidden();
  expect(
    await page.locator("#top [data-hero-dash-scrim]").evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("0");

  await motion.click();
  await expect.poll(async () => sky.getAttribute("mode")).toBe("off");
  expect(await page.locator("canvas:visible").count()).toBe(0);
});

test("keeps the Earth wheel touch-safe and keyboard-operable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const wheel = page.locator("wz-infinite-menu");
  await expect(wheel).toHaveCount(1);

  await expect.poll(async () =>
    wheel.evaluate((element) => {
      const canvas = element.shadowRoot?.querySelector("canvas");
      return canvas ? getComputedStyle(canvas).touchAction : null;
    }),
  ).toBe("pan-y");

  expect(
    await wheel.evaluate((element) => {
      const canvas = element.shadowRoot?.querySelector("canvas");
      if (!canvas) return false;

      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
      });
      canvas.dispatchEvent(event);
      return event.defaultPrevented && canvas.getAttribute("aria-keyshortcuts")?.includes("ArrowRight");
    }),
  ).toBe(true);
});

test("keeps the Creator OS readable when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(`
    (() => {
      const nativeGetContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value(contextId, ...args) {
          if (["webgl", "webgl2", "experimental-webgl"].includes(String(contextId).toLowerCase())) {
            return null;
          }
          return nativeGetContext.call(this, contextId, ...args);
        },
        writable: true,
      });
    })();
  `);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Make the cut without leaving the conversation." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zap is the recipe runtime behind every release." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter the Creative Universe." })).toBeVisible();
  await expect(page.locator("#air h2")).toBeVisible();
});

test("reveals Fire and Water details through keyboard focus and activation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await waitForLandingHydration(page);

  const disclosure = page.locator("#coming-soon article article").first();
  await expect(disclosure).toHaveCount(1);

  await disclosure.focus();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await disclosure.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
});

test("loads the external Fire and Water loop only near its section", async ({ page }) => {
  const videoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/creator-os/assets/fire-water-loop.mp4")) {
      videoRequests.push(request.url());
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();

  const video = page.locator("[data-fire-water-video]");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("data-src", "/creator-os/assets/fire-water-loop.mp4");
  await expect(video).not.toHaveAttribute("src", /fire-water-loop\.mp4/);
  expect(videoRequests).toHaveLength(0);

  await video.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute("src", "/creator-os/assets/fire-water-loop.mp4");
  await expect.poll(() => videoRequests.length).toBeGreaterThan(0);

  const playback = await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    return {
      autoplay: media.autoplay,
      loop: media.loop,
      muted: media.muted,
      playsInline: media.playsInline,
      poster: media.getAttribute("poster"),
      preload: media.preload,
    };
  });
  expect(playback).toEqual({
    autoplay: true,
    loop: true,
    muted: true,
    playsInline: true,
    poster: "/creator-os/assets/fire-water-loop-poster.jpg",
    preload: "none",
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("switches the Creator OS effects off without hiding content", async ({ page }) => {
    // The Chromium mobile descriptor does not consistently propagate the
    // context-level preference, so set it on the page before navigation and
    // the Creator OS receives the real media query at first render.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1, name: "WZRD.tech" })).toBeAttached();
    const sky = page.locator("wz-sky");
    expect(await sky.count()).toBe(1);
    await expect.poll(async () => sky.getAttribute("mode")).toBe("off");
    expect(await page.locator("canvas:visible").count()).toBe(0);
  });
});
