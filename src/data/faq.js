/*
 * The landing page FAQ. One list feeds three consumers: the visible <details>
 * section, the FAQPage JSON-LD, and llms.txt — so the answer an AI quotes is
 * always the answer a person sees.
 */

export const FAQ = [
  {
    q: 'Are the games on Beaver Games really free?',
    a: 'Yes — every game is free, with no tiers, coins, energy timers or unlockable content. There are no ads either. This is a hobby arcade: the games are free, the code is open source, and that is the whole business model.',
  },
  {
    q: 'Do I need to download or install anything?',
    a: 'No. Every game is a web page: open it, play it, close the tab. The biggest game is about 0.4 MB and loads in under a second. If you want an app icon, each game can optionally be installed as a PWA from your browser.',
  },
  {
    q: 'Do the games work offline?',
    a: 'Yes. Each game ships its own service worker, so after the first visit it keeps working with no connection at all — on a plane, on hotel wifi, or on the school network.',
  },
  {
    q: 'Do I need an account to play or save progress?',
    a: 'No accounts, ever. Runs and settings save to your device automatically. You only type a name if you post a score to the weekly leaderboard, and even that needs no sign-up.',
  },
  {
    q: 'What devices and browsers are supported?',
    a: 'Anything with a modern browser: Chromebooks, ten-year-old laptops, phones and tablets. The games support touch, keyboard and (where it fits) gamepad controls.',
  },
  {
    q: 'How do the leaderboards work?',
    a: 'Each game has a weekly board that resets every Monday at 00:00 UTC. The score you post at game over is the score that counts, ranked with a secondary stat per game — waves in Chicken Attack, metres in Beaver Dash, rank in Orbit Cadet.',
  },
];
