/*
 * Service worker: precache the whole app shell (it is only a handful of text
 * files plus icons) so the game is fully playable offline. Navigations, scripts
 * and styles are network-first so an online page always runs one deploy's worth
 * of files; icons and the manifest stay cache-first with background refresh.
 */

const VERSION = 'chicken-attack-v6';

/*
 * './' is the canonical app shell URL. Hosts that normalise /index.html to /
 * (Cloudflare's `html_handling`, for one) answer a request for 'index.html'
 * with a redirect, so it is never precached or matched by name.
 */
const SHELL = './';

const ASSETS = [
  SHELL,
  'manifest.webmanifest',
  'css/styles.css',
  'js/main.js',
  'js/game.js',
  'js/player.js',
  'js/enemies.js',
  'js/waves.js',
  'js/weapons.js',
  'js/powerups.js',
  'js/effects.js',
  'js/hud.js',
  'js/art.js',
  'js/audio.js',
  'js/input.js',
  'js/storage.js',
  'js/util.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
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
        // Cache storage is origin-wide and the hub has its own caches, so this
        // worker only deletes stale versions of its own prefix.
        Promise.all(
          keys
            .filter((k) => k.startsWith('chicken-attack-') && k !== VERSION)
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

  // Navigations: keep the shell fresh online, fall back to it offline.
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
          // A cached shell only works at the scope root — its stylesheet and
          // module URLs are relative. Deep links bounce there instead.
          if (url.pathname !== root.pathname) return Response.redirect(root.href, 302);
          return (await caches.match(SHELL)) || Response.error();
        })
    );
    return;
  }

  /*
   * Scripts and styles are network-first. Cache-first served a page whose HTML
   * (network-first) was newer than its JS/CSS (stale until the next visit), so
   * the first load after a deploy ran old code against new markup — freshly
   * added UI rendered but nothing wired it up. Online, everything now comes
   * from one version; offline falls back to the atomic precache.
   */
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

  // Everything else (icons, manifest): cache-first with background refresh.
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
