/* global self, caches, URL, fetch */

const CACHE_NAME = "family-timeline-static-v2";
const STATIC_PATHS = new Set([
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/icons/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
]);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
    )),
  );
  void self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isStaticAsset = request.destination === "script"
    || request.destination === "style"
    || request.destination === "font"
    || STATIC_PATHS.has(url.pathname);

  if (request.method !== "GET" || url.origin !== self.location.origin || !isStaticAsset) {
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
