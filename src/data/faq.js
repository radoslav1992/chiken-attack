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
    a: 'No. Every game is a web page: open it, play it, close the tab. If you want an app icon, each game can optionally be installed as a PWA from your browser.',
  },
  {
    q: 'Do the games work offline?',
    a: 'Each game can work offline after its first successful load and offline cache setup. Keep the game bookmarked. Community boards and newsletter signup require a connection.',
  },
  {
    q: 'Do I need an account to play or save progress?',
    a: 'No accounts, ever. Personal bests and settings save on this device. Chicken Attack saves between waves; Whittle & Wares saves your forest, inventory and shop as you play. Clearing browser data removes these saves. You only type a name if you post a score to the weekly leaderboard, and even that needs no sign-up.',
  },
  {
    q: 'What devices and browsers are supported?',
    a: 'Anything with a modern browser: Chromebooks, ten-year-old laptops, phones and tablets. The games support touch, keyboard and (where it fits) gamepad controls.',
  },
  {
    q: 'How do the leaderboards work?',
    a: 'Each game has a weekly board that resets every Monday at 00:00 UTC. Scores are player-submitted and sorted highest first; earlier submissions win ties. Chicken Attack has separate difficulty boards. A challenge link shares a score target, not an identical random level.',
  },
];
