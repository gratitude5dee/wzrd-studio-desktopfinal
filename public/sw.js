/*
 * WZRD public landing service worker.
 *
 * This deliberately caches only the anonymous Creator OS shell. Authenticated
 * Studio/editor routes, API responses, uploads, and user media bypass the
 * worker entirely so they cannot be persisted by this public cache.
 */
const CACHE_NAME = "wzrd-public-shell-v1";
const OFFLINE_DOCUMENT = "/offline.html";
const PUBLIC_LANDING_DOCUMENTS = new Set([
  "/",
  "/creator-os/wzrd-creator-os-newdesign.html",
]);
const PUBLIC_STATIC_PREFIXES = ["/_next/static/", "/brand/", "/creator-os/"];
const PUBLIC_STATIC_FILES = new Set(["/favicon.ico", "/manifest.webmanifest"]);
const PRECACHE_URLS = [
  OFFLINE_DOCUMENT,
  "/",
  "/creator-os/wzrd-creator-os-newdesign.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/brand/wzrd-icon-16.png",
  "/brand/wzrd-icon-32.png",
  "/brand/wzrd-icon-48.png",
  "/brand/wzrd-icon-180.png",
  "/brand/wzrd-icon-192.png",
  "/brand/wzrd-icon-512.png",
  "/brand/wzrd-icon-maskable-512.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isPublicLandingDocument(request, url) {
  return request.mode === "navigate" && PUBLIC_LANDING_DOCUMENTS.has(url.pathname);
}

function isPublicStaticAsset(request, url) {
  if (request.headers.has("range")) {
    return false;
  }

  return (
    PUBLIC_STATIC_FILES.has(url.pathname) ||
    PUBLIC_STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  );
}

async function putInPublicCache(request, response) {
  if (!response || !response.ok || response.type === "opaque") {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallback) {
  try {
    const response = await fetch(request);
    return await putInPublicCache(request, response);
  } catch {
    const cached = await caches.match(request);
    return cached || fallback();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    // The complete anonymous shell is intentionally small enough to make the
    // very first installed launch useful offline. Video and all private routes
    // remain network-only and are never included here.
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Do not call skipWaiting(): a new worker activates after existing sessions
// close, avoiding surprise reloads while someone is working in Studio.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("wzrd-public-shell-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return;
  }

  if (isPublicLandingDocument(request, url)) {
    event.respondWith(
      networkFirst(request, async () => {
        const offline = await caches.match(OFFLINE_DOCUMENT);
        return offline || Response.error();
      })
    );
    return;
  }

  if (isPublicStaticAsset(request, url)) {
    event.respondWith(networkFirst(request, () => Response.error()));
  }
});
