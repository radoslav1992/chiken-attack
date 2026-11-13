const VERSION = 'timber-tails-v1-20261112';
const ASSETS = [
  './',
  'css/styles.css',
  'js/main.js',
  'js/engine.js',
  'js/build.js',
  'js/levels.js',
  'js/render.js',
  'js/sprites.js',
  'js/audio.js',
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
          keys
            .filter((k) => k.startsWith('timber-tails-') && k !== VERSION)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
/* Network first, so a fix lands on the next visit; the cache is for offline. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  const key =
    event.request.mode === 'navigate'
      ? new URL('./', self.registration.scope).href
      : event.request;
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
