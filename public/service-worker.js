/* global self, caches, URL, fetch */

const CACHE_NAME = "konogoro-static-v1";
const MEDIA_CACHE_NAME = "konogoro-media-v1";
const MEDIA_CACHE_LIMIT = 300;
const STATIC_PATHS = new Set([
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-light-192.png",
  "/icons/icon-dark-192.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME && name !== MEDIA_CACHE_NAME).map((name) => caches.delete(name)),
    )),
  );
  void self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_MEDIA_CACHE") event.waitUntil(caches.delete(MEDIA_CACHE_NAME));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isStaticAsset = request.destination === "script"
    || request.destination === "style"
    || request.destination === "font"
    || STATIC_PATHS.has(url.pathname);
  const isMediaPreview = /^\/api\/media\/[^/]+\/content$/.test(url.pathname)
    && (url.searchParams.get("variant") === "thumbnail" || url.searchParams.get("variant") === "preview");

  if (request.method !== "GET" || url.origin !== self.location.origin || (!isStaticAsset && !isMediaPreview)) {
    return;
  }

  if (isMediaPreview) {
    event.respondWith(caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()).then(() => trimMediaCache(cache)));
      return response;
    }));
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

async function trimMediaCache(cache) {
  const requests = await cache.keys();
  await Promise.all(requests.slice(0, Math.max(0, requests.length - MEDIA_CACHE_LIMIT)).map((request) => cache.delete(request)));
}
