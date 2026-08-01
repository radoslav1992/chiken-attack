/*
 * The bits of being an installable game that are the same everywhere.
 *
 * Service-worker registration, the postMessage bridge from the arcade page's
 * sound button, and pausing when the tab goes away.
 */

/**
 * Register the game's own service worker.
 *
 * Registered with a RELATIVE path on purpose: `sw.js` from /orbit-cadet/ takes
 * the scope /orbit-cadet/, which is what keeps four service workers on one
 * origin from fighting over each other's pages.
 */
export function registerServiceWorker(path = 'sw.js') {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(path).catch(() => {
      /* No offline play. Everything else still works, so say nothing. */
    });
  });
}

/**
 * The arcade page hosts the game in an iframe and has its own sound button.
 * This listens for it.
 *
 * The origin check is the whole security of this: without it, any page that
 * managed to frame the game could post messages into it.
 */
export function bridgeArcadeSound(apply) {
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const msg = e.data;
    if (!msg || msg.type !== 'arcade:set-sound') return;
    apply(!!msg.on);
  });
}

/**
 * Audio contexts start suspended until a real gesture. Every game needs the
 * same "first touch or key unlocks sound" hook, once.
 */
export function unlockOnFirstGesture(unlock) {
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
    window.addEventListener(evt, () => unlock(), { once: true, passive: true })
  );
}

/**
 * Pause when the tab is hidden or the window loses focus.
 *
 * Both events, because they are not the same thing: switching apps hides the
 * document, but clicking another window on a desktop only blurs it — and a game
 * that keeps running while you are reading something else is a game that has
 * killed you off-screen.
 */
export function pauseOnHide(pause) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', () => pause());
}
