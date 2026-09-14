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
    meta: { developer: 'The Coop', released: 'Jul 2026', releasedISO: '2026-07', genreLine: 'Shooter · Waves' },
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
  {
    slug: 'beaver-dash',
    title: 'Beaver Dash',
    genre: 'Runner',
    badge: 'NEW',
    playable: true,
    playPath: '/beaver-dash/',
    art: '/media/beaver-dash-card.png',
    stageArt: '/media/beaver-dash-stage.png',
    icon: '/beaver-dash/icons/icon-192.png',
    tagline: 'Endless runner · v2',
    blurb: 'One button, five different questions. A tap is not the answer to all of them.',
    about: [
      'The dam is downstream and you are late. Sprint through a forest that changes weather as you go — midnight, aurora, cold mist, downpour, storm, ember dawn — and hoover up acorns on the way. Chain them without dropping the thread and the multiplier climbs to five.',
      'Every obstacle asks something different of the one button. A stump wants a tap. A log raft wants a full held jump. The river wants distance, not height. The dam is taller than one jump can reach. And the heron flies at exactly hop height, so the only answer to it is to press nothing at all. A third press in the air is a tail-slam that smashes stumps and rocks for points — but it spends your descent, so dive early and you land with nothing left.',
    ],
    stats: { rating: '—', size: '0.1 MB', runTime: '~3 min', players: '1' },
    meta: { developer: 'The Coop', released: 'Jul 2026', releasedISO: '2026-07', genreLine: 'Runner · Endless' },
    capabilities: ['Touch', 'Keyboard', 'Offline', 'No ads'],
    controls: [
      { key: 'TAP', desc: 'A short hop — enough for a stump' },
      { key: 'HOLD', desc: 'The full jump, for log rafts and the river' },
      { key: 'TAP ×2', desc: 'Double jump — the only way over a dam' },
      { key: 'TAP ×3', desc: 'Tail-slam dive: smashes stumps and rocks' },
    ],
    tips: [
      'Herons fly at hop height. The counter-move is to do nothing.',
      'Acorn arcs trace the safe path. Follow them and the combo pays.',
      'A gap needs a long jump, a dam needs a tall one. Read which.',
      'Grab the fern shield when you see it — it eats one mistake.',
    ],
  },
  {
    slug: 'orbit-cadet',
    title: 'Orbit Cadet',
    genre: 'Pinball',
    badge: 'NEW',
    playable: true,
    playPath: '/orbit-cadet/',
    art: '/media/orbit-cadet-card.png',
    stageArt: '/media/orbit-cadet-stage.png',
    icon: '/orbit-cadet/icons/icon-192.png',
    tagline: 'Classic space pinball · v2',
    blurb: 'Classic space pinball: chrome rails, glowing bumpers, mission lights, and seven ranks to climb.',
    about: [
      'A pinball table where the point is not the score but the promotion. Roll over the mission target to arm one — clear the drop-target bank, sweep the beacons, run the orbit, work the spinner — and each one you finish moves you up a rank, from Cadet all the way to Admiral. The rank you reach is what goes on the board next to your score.',
      'The left half of the screen is the left flipper and the right half is the right, so a phone held upright is the whole controller. Hold low to charge the plunger. And you can shove the table when a shot is going wrong: three shoves and it tilts, which kills the flippers and hands the ball to gravity.',
    ],
    stats: { rating: '—', size: '0.2 MB', runTime: '~4 min', players: '1' },
    meta: { developer: 'The Coop', released: 'Jul 2026', releasedISO: '2026-07', genreLine: 'Pinball · Missions' },
    capabilities: ['Touch', 'Keyboard', 'Offline', 'No ads'],
    controls: [
      { key: 'Z / ←', desc: 'Left flipper — or tap the left half of the screen' },
      { key: 'M / →', desc: 'Right flipper — or tap the right half of the screen' },
      { key: 'SPACE', desc: 'Hold to charge, release to launch — or hold the launch button' },
      { key: '↔', desc: 'Nudge the table. Three shoves and it tilts' },
    ],
    tips: [
      'Arm a mission before you chase points. Missions are where the score is.',
      'The orbit is the best shot on the table. Take it with the left flipper.',
      'Clearing the whole target bank pays a bonus, then the bank comes back up.',
      'Nudge to save a ball, but count your shoves — the third one is free, the fourth is not.',
    ],
  },
  {
    slug: 'whittle-wares',
    title: 'Whittle & Wares',
    genre: 'Shopkeeper RPG',
    badge: 'NEW',
    playable: true,
    playPath: '/whittle-wares/',
    art: '/media/whittle-wares-card.png',
    stageArt: '/media/whittle-wares-stage.png',
    icon: '/whittle-wares/icons/icon-192.png',
    tagline: 'A shop for all seasons',
    blurb: 'Gather, craft and grow your woodland shop. Four seasons, guild upgrades and a career that keeps going.',
    about: [
      'Build a life at the edge of the wood. Four seasons bring changing demand, harvest bonuses and market caravans. Your journal offers new goals every ten game days, with guild stamps and maker badges to collect. Every morning you walk out to gather — bark and berries near the door, clay and flint at the ford, and ironwood and amber further north than your tools will yet let you go. Stamina is the whole budget: it goes on walking and on gathering, and when it runs out you are carried home with whatever you managed.',
      'Every evening you price what is on the shelf and open up. Two goods are wanted each day and one is glutted, so the right price changes with the morning. Customers who think you are dear will haggle once — take their offer or hold firm and risk the sale. Word gets around either way. Pay rent every fifth day and make it through your first thirty days to unlock an ongoing career: twenty guild upgrades and three advanced recipes. Rent then stays fixed. The first thirty days set your leaderboard score, while your shop keeps growing. Your forest, inventory and counter save as you play on this browser.',
    ],
    stats: { rating: '—', size: '0.1 MB', runTime: 'Ongoing career', players: '1' },
    meta: { developer: 'The Coop', released: 'Jul 2026', releasedISO: '2026-07', genreLine: 'RPG · Tycoon' },
    capabilities: ['Touch', 'Keyboard', 'Offline', 'Saves', 'No ads'],
    controls: [
      { key: 'DRAG', desc: 'Walk — drag anywhere in the wood' },
      { key: 'WASD', desc: 'Walk with the arrow keys or WASD' },
      { key: 'STAND', desc: 'Stand on a plant to gather it. No button' },
      { key: 'H', desc: 'Finish gathering and return to the shop' },
      { key: 'P', desc: 'Pause and open your journal' },
    ],
    tips: [
      'Use Return to shop or H when your gathering is done. Check the journal for seasonal goals.',
      'Two goods are wanted each morning. Price those up, and the glutted one down.',
      'A haggle is a real offer. Refusing one costs you the sale and a little goodwill.',
      'Craft in batches, fill commissions and save guild stamps for your day-31 workshop.',
    ],
  },
  { slug: 'neon-dodge', title: 'Neon Dodge', genre: 'Arcade', badge: 'SOON', playable: false },
  { slug: 'dam-defender', title: 'Dam Defender', genre: 'Action', badge: 'SOON', playable: false },
];

export const PLAYABLE = GAMES.filter((g) => g.playable);
export const GAME_SLUGS = PLAYABLE.map((g) => g.slug);

export function gameBySlug(slug) {
  return GAMES.find((g) => g.slug === slug) || null;
}
