/*
 * The Coop Arcade — hub service worker, scope "/".
 *
 * Two jobs:
 *  1. Keep the hub (and the site-level 404 behaviour) available offline.
 *  2. Migrate pre-arcade installs. Before the site became an arcade the game
 *     lived at the origin root and registered THIS URL with scope "/", so old
 *     clients update to this worker automatically; its activate step deletes
 *     their legacy caches. The game's own worker now lives at
 *     /chicken-attack/sw.js with a matching scope, which wins for game pages.
 *
 * Cache storage is shared per origin, so this worker only ever touches caches
 * with its own prefix (plus the explicitly listed legacy names) — never the
 * games' caches.
 */

const VERSION = 'coop-hub-v1';
const LEGACY = /^chicken-attack-v[1-5]$/; // pre-arcade caches at this scope

const ASSETS = [
  './',
  'css/hub.css',
  '404.html',
  // The hub shows this game's icon; cached here so the offline hub is whole.
  'chicken-attack/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => (k.startsWith('coop-hub-') && k !== VERSION) || LEGACY.test(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Game pages are controlled by the game's own worker; anything under a game
  // directory that still reaches this worker just goes to the network.
  if (url.pathname.startsWith('/chicken-attack/')) {
    if (request.destination === 'image') {
      // …except the icon the hub itself displays.
      event.respondWith(caches.match(request).then((r) => r || fetch(request)));
    }
    return;
  }

  // Navigations: network-first; offline, serve the hub shell (deep links
  // bounce to "/" so the shell's relative URLs resolve).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected && url.pathname === '/') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(async () => {
          if (url.pathname !== '/') return Response.redirect('/', 302);
          return (await caches.match('./')) || Response.error();
        })
    );
    return;
  }

  // Scripts and styles network-first (mixed-version lesson); rest cache-first.
  const critical = request.destination === 'script' || request.destination === 'style';
  event.respondWith(
    (critical
      ? fetch(request)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => caches.match(request))
      : caches.match(request).then((cached) => {
          const network = fetch(request)
            .then((res) => {
              if (res && res.status === 200 && res.type === 'basic') {
                const copy = res.clone();
                caches.open(VERSION).then((c) => c.put(request, copy));
              }
              return res;
            })
            .catch(() => cached);
          return cached || network;
        })
    ).then((r) => r || Response.error())
  );
});
