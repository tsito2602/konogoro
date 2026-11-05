/* global self, caches, URL, fetch, clients */

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

// アプリ通知。本文はサーバーで暗号化した JSON（title・body・url・tag）。
self.addEventListener("push", (event) => {
  let message;
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = {};
  }
  const title = typeof message.title === "string" ? message.title : "このごろ";
  const tag = typeof message.tag === "string" ? message.tag : "konogoro";
  event.waitUntil(
    // 開いている画面に「受け取った」と伝える。試しのお知らせが届いたかを、本人に聞かずに確かめられる。
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => windows.forEach((client) => client.postMessage({ type: "PUSH_RECEIVED", tag })))
      .then(() =>
        self.registration.showNotification(title, {
          body: typeof message.body === "string" ? message.body : "新しい思い出が届きました",
          tag,
          icon: "/android-chrome-192x192.png",
          badge: "/android-chrome-192x192.png",
          data: { url: typeof message.url === "string" && message.url.startsWith("/") ? message.url : "/" },
        }),
      ),
  );
});

// 通知を押したら、開いている画面があればそこで、なければ新しく開く。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url).catch(() => undefined);
        return;
      }
      await clients.openWindow(url);
    }),
  );
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
