/**
 * ARGOS — Service Worker
 *
 * Strategie de cache :
 *   - Precache : shell applicatif (HTML, CSS, JS)
 *   - Runtime  : cache-first pour les tuiles cartographiques,
 *                network-first pour les API, stale-while-revalidate pour les assets statiques
 */

const CACHE_NAME = "argos-v1";
const TILE_CACHE = "argos-tiles-v1";
const API_CACHE = "argos-api-v1";

const PRECACHE_URLS = [
  "/",
  "/login",
  "/manifest.json",
];

const TILE_HOSTS = [
  "tile.openstreetmap.org",
  "tiles.stadiamaps.com",
  "basemaps.cartocdn.com",
  "api.maptiler.com",
  "demotiles.maplibre.org",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== TILE_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isTileRequest(url) {
  return TILE_HOSTS.some((h) => url.hostname.includes(h));
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|svg|ico)$/)
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Tuiles cartographiques : cache-first (stockage longue duree)
  if (isTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // API : network-first avec fallback cache
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === "GET") {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || new Response('{"error":"offline"}', {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })))
    );
    return;
  }

  // Assets statiques : stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Navigation : network-first
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/") || caches.match("/login"))
    );
    return;
  }

  // Default : network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Nettoyage periodique du cache de tuiles (max 2000 entrees)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    for (let i = 0; i < keys.length - maxItems; i++) {
      await cache.delete(keys[i]);
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "TRIM_CACHES") {
    trimCache(TILE_CACHE, 2000);
    trimCache(API_CACHE, 500);
  }
});
