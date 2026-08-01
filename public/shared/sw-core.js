/*
 * The service worker every game runs.
 *
 * Loaded with importScripts from each game's own sw.js, which then supplies a
 * cache name and an asset list. Four near-identical hundred-line files became
 * four fifteen-line ones.
 *
 * THE RULE FOR THIS FILE: it is loaded by every installed service worker on the
 * origin. A mistake here is not one broken game, it is four games serving stale
 * or broken files to everyone who ever installed them — and a bad service worker
 * outlives the deploy that shipped it. Change it with the offline test running,
 * and bump every game's `version` when you do.
 *
 * The caching strategy, and why:
 *
 *   navigations       network first, fall back to the cached shell
 *   scripts + styles  network first, fall back to cache
 *   everything else   cache first, refreshed in the background
 *
 * Scripts and styles are network-first because a stale-while-revalidate cache
 * across a deploy can serve last week's main.js against this week's game.js, and
 * the result is a white screen with a module error rather than an old-but-working
 * game. Being one round trip slower is a cheap price for never being incoherent.
 * Icons and images are cache-first because they change almost never.
 */

/* global self, caches, fetch, Response, URL */

self.arcadeServiceWorker = function arcadeServiceWorker(config) {
  const VERSION = config.version;
  const SHELL = config.shell || './';
  const ASSETS = config.assets || [SHELL];

  if (!VERSION) throw new Error('arcadeServiceWorker: a version (cache name) is required');

  /* The prefix is derived from the version, so a game only ever deletes its own
   * old caches. Cache storage is shared across the whole origin: a worker that
   * cleared everything it did not recognise would wipe the other three games
   * every time it activated. */
  /* Keep the trailing hyphen. `beaver-dash-` cannot match `beaver-dashboard-v1`;
   * `beaver-dash` could. The original workers all wrote the hyphen out by hand
   * and deriving it without one would have been a quiet widening of what each
   * game is allowed to delete from a cache store it shares with three others. */
  const PREFIX = `${VERSION.replace(/-v\d+$/, '')}-`;

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
            keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))
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
            /* Offline, and the request was for some deep path inside the game.
             * Redirect to the shell rather than answering a URL with the wrong
             * document, which would leave the address bar lying about where you
             * are. */
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
};
