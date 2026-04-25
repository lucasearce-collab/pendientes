const CACHE = "clarity-v" + Date.now();

self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (url.hostname.includes("supabase.co") ||
      url.hostname.includes("fonts.googleapis.com") ||
      url.hostname.includes("fonts.gstatic.com")) {
    e.respondWith(fetch(e.request).catch(() => new Response("")));
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => new Response("Offline", { status: 503 }))
  );
});
