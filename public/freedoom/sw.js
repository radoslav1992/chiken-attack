const VERSION = 'freedoom-v1-20261113';
/* The page shell is fetched up front. The engine and the 11 MB of game data
 * are not: they are cached the first time the player actually starts the
 * game (see the fetch handler), so a visit that never presses Play costs
 * nothing. */
const ASSETS = [
  './',
  'css/styles.css',
  'js/main.js',
  'js/score.js',
  'icon.svg',
  'manifest.webmanifest',
  '/shared/arcade.js',
  '/shared/arcade.css',
  '/fonts/press-start-2p.woff2',
];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('freedoom-') && k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  const key =
    event.request.mode === 'navigate' ? new URL('./', self.registration.scope).href : event.request;
  /* The engine and data never change under a given version: cache first. */
  const heavy = /\/(engine|data)\//.test(url.pathname);
  if (heavy) {
    event.respondWith(
      caches.match(key).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            if (response.ok && !response.redirected) {
              const copy = response.clone();
              event.waitUntil(caches.open(VERSION).then((cache) => cache.put(key, copy)));
            }
            return response;
          }),
      ),
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(caches.open(VERSION).then((cache) => cache.put(key, copy)));
        }
        return response;
      })
      .catch(async () => (await caches.match(key)) || Response.error()),
  );
});
