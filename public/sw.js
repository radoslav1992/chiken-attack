/*
 * Self-destructing service worker, served at the site root.
 *
 * Two generations of clients registered a worker at this URL with scope "/":
 * the pre-arcade game and the later static hub (coop-hub caches). The Astro
 * site has no root-scope worker — its pages are server-fresh and the games
 * carry their own workers — so old clients update to this stub, which drops
 * the obsolete caches, unregisters and reloads the open tabs.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('coop-hub-') || /^chicken-attack-v[1-5]$/.test(k))
          .map((k) => caches.delete(k))
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
