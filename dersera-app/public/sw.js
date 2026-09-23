// Yalnızca oyun sayfası (/game) ve değişmez statik dosyalar önbelleğe alınır.
// Sayfa önce ağdan istenir; ağ yoksa ya da 4 sn içinde yanıt gelmezse önbellekteki kopya açılır.
const CACHE = "dersera-oyun-v1";
const PAGE_KEY = "/game";
const PAGE_TIMEOUT_MS = 4000;

const isStatic = (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
const isGamePage = (url) => url.origin === self.location.origin && url.pathname === "/game";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const raw of event.data.urls) {
        const url = new URL(raw, self.location.origin);
        if (!isStatic(url) && !isGamePage(url)) continue;
        const key = isGamePage(url) ? PAGE_KEY : url.href;
        if (await cache.match(key)) continue;
        try {
          const res = await fetch(url.href);
          if (res.ok) await cache.put(key, res);
        } catch {
          /* çevrimdışı: sonraki ziyarette denenir */
        }
      }
    })()
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(request, { signal: controller.signal });
    if (res.ok) await cache.put(PAGE_KEY, res.clone());
    return res;
  } catch {
    return (await cache.match(PAGE_KEY)) ?? Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate" && isGamePage(url)) {
    event.respondWith(networkFirstPage(event.request));
  } else if (isStatic(url)) {
    event.respondWith(cacheFirst(event.request));
  }
});
