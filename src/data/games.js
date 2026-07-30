/*
 * The single source of truth for every cabinet in the arcade. The landing
 * page, the game pages and the API validation all read from here.
 *
 * To add a game: drop its self-contained build into public/<slug>/ (relative
 * paths only, own service worker), then add an entry with `playable: true`.
 */

export const GAMES = [
  {
    slug: 'chicken-attack',
    title: 'Chicken Attack',
    genre: 'Shooter',
    badge: 'HOT',
    playable: true,
    playPath: '/chicken-attack/',
    art: '/media/chicken-attack-card.png',
    stageArt: '/media/chicken-attack-stage.png',
    icon: '/chicken-attack/icons/icon-192.png',
    tagline: 'Wave survival · v2',
    blurb: 'Blast waves of invading space poultry. Nine weapons, boss hens, drumsticks.',
    about: [
      'The galaxy has a poultry problem. Drag your fighter around the screen, hold the line against wave after wave of chickens, and hoover up the drumsticks they leave behind — a hundred of them buys you a spare ship.',
      'Nine weapons with ten power levels each, timed power-ups from wing drones to a screen-clearing pressure cooker, and a boss every fifth wave: a crowned giant hen and a chicken mothership take turns. Runs autosave between waves, so closing the tab only pauses the fight.',
    ],
    stats: { rating: '—', size: '0.4 MB', runTime: '~5 min', players: '1' },
    meta: { developer: 'The Coop', released: 'Jul 2026', genreLine: 'Shooter · Waves' },
    capabilities: ['Touch', 'Keyboard', 'Gamepad', 'Offline', 'No ads'],
    controls: [
      { key: 'DRAG', desc: 'Fly — the ship follows your finger' },
      { key: '← →', desc: 'Fly with arrows or WASD' },
      { key: 'SPACE', desc: 'Fire (auto-fire is on by default)' },
      { key: 'X', desc: 'Homing missile · or tap with a second finger' },
    ],
    tips: [
      'Grab every drumstick. 100 of them is a whole extra ship.',
      'Same-weapon gifts level it up. Dying costs two levels.',
      'Bosses telegraph the beam — watch for the dashed line.',
      'Every seventh wave is a feast. Nothing shoots back; eat.',
    ],
  },
  // Placeholder cabinets: shown in the catalog, not linked anywhere.
  { slug: 'beaver-dash', title: 'Beaver Dash', genre: 'Platformer', badge: 'SOON', playable: false },
  { slug: 'neon-dodge', title: 'Neon Dodge', genre: 'Arcade', badge: 'SOON', playable: false },
  { slug: 'dam-defender', title: 'Dam Defender', genre: 'Action', badge: 'SOON', playable: false },
];

export const PLAYABLE = GAMES.filter((g) => g.playable);
export const GAME_SLUGS = PLAYABLE.map((g) => g.slug);

export function gameBySlug(slug) {
  return GAMES.find((g) => g.slug === slug) || null;
}
