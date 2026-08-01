/*
 * Chicken Attack service worker, scope /chicken-attack/.
 *
 * The body lives in /shared/sw-core.js — this file is the manifest of what to
 * precache and nothing else. Version bumped when the shared core changed, so
 * every installed copy replaces itself rather than running last deploy's worker
 * against this deploy's files.
 *
 * The shared modules are precached by absolute path because they sit outside
 * this scope. A service worker may cache anything same-origin; it just may not
 * intercept requests outside its own scope, which is exactly the arrangement we
 * want — one shared file, four independent caches.
 */

importScripts('/shared/sw-core.js');

self.arcadeServiceWorker({
  version: 'chicken-attack-v8',
  shell: './',
  assets: [
    './',
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
    '/shared/store.js',
    '/shared/scores.js',
    '/shared/pwa.js',
    '/shared/viewport.js',
    '/shared/audio-engine.js',
  ],
});
