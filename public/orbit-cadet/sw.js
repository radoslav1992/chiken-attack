/*
 * Orbit Cadet service worker, scope /orbit-cadet/. Precaches the shell for
 * offline play; navigations, scripts and styles are network-first so an online
 * page always runs one deploy's worth of files. Only touches caches carrying
 * its own prefix — cache storage is shared across the whole origin.
 */

const VERSION = 'orbit-cadet-v2';
const SHELL = './';

const ASSETS = [
  SHELL,
  'manifest.webmanifest',
  'css/styles.css',
  'js/main.js',
  'js/game.js',
  'js/physics.js',
  'js/table.js',
  'js/audio.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('orbit-cadet-') && k !== VERSION).map((k) => caches.delete(k))
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
  // Score submissions and board reads must never be answered from cache.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(async () => {
          const root = new URL(SHELL, self.registration.scope);
          if (url.pathname !== root.pathname) return Response.redirect(root.href, 302);
          return (await caches.match(SHELL)) || Response.error();
        })
    );
    return;
  }

  const critical = request.destination === 'script' || request.destination === 'style';
  if (critical) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
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
  );
});
