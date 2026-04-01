/* This project does not use a service worker in production.
   If a browser has a stale SW from a previous deployment, it can break asset loading.
   Publish this file so the browser can update and immediately unregister. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      try {
        await self.registration.unregister();
      } catch {}
      try {
        const clientsArr = await self.clients.matchAll({ type: "window" });
        clientsArr.forEach((c) => c.navigate(c.url));
      } catch {}
    })()
  );
});

self.addEventListener("fetch", () => {
  // No-op: allow network to handle requests.
});

