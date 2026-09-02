/* global self, caches, URL, fetch */

const MEDIA_CACHE_NAME = "konogoro-media-v2";
const MEDIA_CACHE_LIMIT = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== MEDIA_CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_MEDIA_CACHE") event.waitUntil(caches.delete(MEDIA_CACHE_NAME));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isMediaPreview = /^\/api\/media\/[^/]+\/content$/.test(url.pathname)
    && (url.searchParams.get("variant") === "thumbnail" || url.searchParams.get("variant") === "preview");

  if (
    request.method !== "GET" ||
    request.headers.has("Range") ||
    url.origin !== self.location.origin ||
    !isMediaPreview
  ) {
    return;
  }

  event.respondWith(caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.status === 200 && response.headers.get("Content-Type")?.startsWith("image/")) {
      event.waitUntil(cache.put(request, response.clone()).then(() => trimMediaCache(cache)).catch(() => {}));
    }
    return response;
  }));
});

async function trimMediaCache(cache) {
  const requests = await cache.keys();
  await Promise.all(requests.slice(0, Math.max(0, requests.length - MEDIA_CACHE_LIMIT)).map((request) => cache.delete(request)));
}
