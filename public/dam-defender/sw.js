const VERSION = 'dam-defender-v2-20260914';
const ASSETS = [
  './',
  'css/styles.css',
  'js/main.js',
  'js/data.js',
  'js/engine.js',
  'js/render.js',
  'js/audio.js',
  'cover.svg',
  'icon.svg',
  'manifest.webmanifest',
  '/shared/arcade.js',
  '/shared/arcade.css',
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
            .filter((k) => k.startsWith('dam-defender-') && k !== VERSION)
            .map((k) => caches.delete(k)),
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
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(VERSION)
              .then((cache) =>
                cache.put(
                  event.request.mode === 'navigate'
                    ? new URL('./', self.registration.scope).href
                    : event.request,
                  copy,
                ),
              ),
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(
          event.request.mode === 'navigate'
            ? new URL('./', self.registration.scope).href
            : event.request,
        );
        return cached || Response.error();
      }),
  );
});
