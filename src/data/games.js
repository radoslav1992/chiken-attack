/*
 * The single source of truth for every cabinet in the arcade. The landing
 * page, the game pages and the API validation all read from here.
 *
 * Three fields exist for search and sharing rather than for the page itself:
 *   seo.title        the <title>: name, what kind of game, that it is free
 *   seo.description  the snippet under a search result, 120-160 characters
 *   share / ogImage  the line and picture on a link preview. The picture is a
 *                    1200x630 JPEG made by tools/make-og-images.mjs
 * tests/seo.test.mjs holds all three to their limits.
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
    art: '/media/chicken-attack-card.webp',
    stageArt: '/media/chicken-attack-stage.webp',
    icon: '/chicken-attack/icons/icon-192.png',
    tagline: 'Wave survival · v2',
    seo: {
      title: 'Chicken Attack — free space shooter online | Beaver Games',
      description:
        'Play Chicken Attack free in your browser: a wave-survival space shooter with nine weapons, boss hens and three difficulty modes. No download, no ads.',
    },
    share: 'Nine weapons, boss hens and wave after wave of space poultry.',
    ogImage: '/media/og/chicken-attack.jpg',
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
    art: '/media/beaver-dash-card.webp',
    stageArt: '/media/beaver-dash-stage.webp',
    icon: '/beaver-dash/icons/icon-192.png',
    tagline: 'Endless runner · v2',
    seo: {
      title: 'Beaver Dash — free one-button endless runner | Beaver Games',
      description:
        'Play Beaver Dash free online: a one-button endless runner through a forest that changes weather. Hop, double-jump, tail-slam and chase the weekly board.',
    },
    share: 'One button, an endless forest and a very determined beaver.',
    ogImage: '/media/og/beaver-dash.jpg',
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
    art: '/media/orbit-cadet-card.webp',
    stageArt: '/media/orbit-cadet-stage.webp',
    icon: '/orbit-cadet/icons/icon-192.png',
    tagline: 'Classic space pinball · v2',
    seo: {
      title: 'Orbit Cadet — free space pinball game online | Beaver Games',
      description:
        'Play Orbit Cadet free in your browser: classic space pinball with missions, multiball and seven ranks from Cadet to Admiral. Touch or keyboard, no download.',
    },
    share: 'Classic space pinball with missions and seven ranks to climb.',
    ogImage: '/media/og/orbit-cadet.jpg',
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
    art: '/media/whittle-wares-card.webp',
    stageArt: '/media/whittle-wares-stage.webp',
    icon: '/whittle-wares/icons/icon-192.png',
    tagline: 'A shop for all seasons',
    seo: {
      title: 'Whittle & Wares — free shopkeeper RPG game | Beaver Games',
      description:
        'Play Whittle & Wares free online: a pixel shopkeeper RPG. Forage, craft, set prices and haggle through four seasons. Saves in your browser, no account.',
    },
    share: 'Forage, craft and haggle through four seasons of shopkeeping.',
    ogImage: '/media/og/whittle-wares.jpg',
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
  {
    slug: 'dam-defender', title: 'Dam Defender', genre: 'Strategy', badge: 'NEW', playable: true,
    playPath: '/dam-defender/', art: '/media/dam-defender-card.svg', stageArt: '/media/dam-defender-card.svg', icon: '/dam-defender/icon.svg',
    tagline: 'Small paws. Big responsibility.',
    seo: {
      title: 'Dam Defender — free tower defence game online | Beaver Games',
      description:
        'Play Dam Defender free in your browser: woodland tower defence across three rivers with floodgates, perks, bosses and a daily challenge. No download, no ads.',
    },
    share: 'Build towers, open the floodgates and protect the village.',
    ogImage: '/media/og/dam-defender.jpg',
    blurb: 'Build a woodland defence, open the floodgates and protect your beaver village. Three rivers. Endless possibilities.',
    about: [
      'A little village sits behind your dam. Choose where to build acorn turrets, log launchers, bramble gardens, watermills and watchtowers, then defend against waves of woodland raiders. Floods sweep back ground enemies, but flying herons stay above the water. Drain the reservoir too far and your dam becomes vulnerable.',
      'Protect Willow Bend, Copper Fork and Moonwater Marsh, each with its own routes and boss. Pick a new perk every three waves, branch your tower upgrades and unlock captains with different abilities. Beat wave twelve to protect a river, then continue into endless mode. A daily river gives everyone the same map, captain and seed; challenge links let friends replay your setup. Your battle saves on this browser, including enemies already on the trail.',
    ],
    stats: { rating: '—', size: '0.1 MB', runTime: '10–15 min', players: '1' },
    meta: { developer: 'The Coop', released: 'Sep 2026', releasedISO: '2026-09', genreLine: 'Strategy · Tower defence' },
    capabilities: ['Touch', 'Keyboard', 'Offline', 'Saves', 'No ads'],
    controls: [
      { key: 'TAP', desc: 'Select a clearing, choose a tower, then build' },
      { key: 'SPACE', desc: 'Send the next wave' },
      { key: 'F', desc: 'Open floodgates · costs 40 water' },
      { key: '1–5', desc: 'Choose a tower type; arrows select a clearing, Enter builds' },
      { key: 'P', desc: 'Pause and save your defence' },
    ],
    tips: [
      'Start with two Acorn turrets close to the trail. Build sites near bends cover enemies for longer.',
      'Logs and brambles control ground crowds. Acorns and watchtowers also hit flying herons.',
      'Keep 25 water in reserve: below that, the dam takes 50% more damage. Floods cost 40.',
      'Watermills fund future upgrades, but cannot stop a raider. Balance income against damage.',
      'Inspect the next wave, repair between battles, and choose perks that strengthen your tower mix.',
    ],
  },
  {
    slug: 'timber-tails',
    title: 'Timber Tails',
    genre: 'Platformer',
    badge: 'NEW',
    playable: true,
    playPath: '/timber-tails/',
    art: '/media/timber-tails-card.webp',
    stageArt: '/media/timber-tails-stage.webp',
    icon: '/timber-tails/icon.svg',
    tagline: '8 worlds · 32 stages',
    seo: {
      title: 'Timber Tails — free platformer game online | Beaver Games',
      description:
        'Play Timber Tails free in your browser: a side-scrolling platformer with 8 worlds, 32 hand-drawn stages and boss fights. Touch, keyboard or gamepad.',
    },
    share: 'Eight worlds, thirty-two stages and one very cross boar.',
    ogImage: '/media/og/timber-tails.jpg',
    blurb: 'Run, jump and tail-slam a beaver kit home. Eight worlds, thirty-two hand-drawn stages, one very cross boar.',
    about: [
      'Pip the beaver kit has been washed a long way downstream, and the lodge is eight worlds off: meadow, burrow, marsh, pine tops, frost, embers, a storm gorge and a moonlit mill. Each world is four stages and each brings its own trouble — bats that drop from the roof, pike that leap from the reeds, rafts and lifts, ice that will not let you stop, geysers on a timer, saw blades on a rail. Land on most things to be rid of them. Not hedgehogs: those need a tail-slam, which is down in mid-air, and which also cracks crates and shakes loose whatever a stash is holding.',
      'Every fourth stage ends in an arena with Bristle the boar, who learns a new trick every couple of worlds. You have three hearts, three lives and a checkpoint in every stage; a hundred acorns buys another life. Golden logs are hidden off the obvious route for anyone who wants all of them. Stages you have opened stay open on this browser, and a run in progress is saved at the start of each stage.',
    ],
    stats: { rating: '—', size: '0.2 MB', runTime: '2–3 min a stage', players: '1' },
    meta: { developer: 'The Coop', released: 'Nov 2026', releasedISO: '2026-11', genreLine: 'Platformer · 32 stages' },
    capabilities: ['Touch', 'Keyboard', 'Gamepad', 'Offline', 'Saves', 'No ads'],
    controls: [
      { key: '← →', desc: 'Run — arrows or A/D, or slide on the touch pad' },
      { key: 'SPACE', desc: 'Jump. Hold for the full leap, tap for a hop' },
      { key: '↓', desc: 'In the air: tail-slam. On a branch, with jump: drop through' },
      { key: 'X', desc: 'Throw a pinecone, once you have found some' },
      { key: 'P', desc: 'Pause' },
    ],
    tips: [
      'Hedgehogs cannot be landed on. Tail-slam beside them, or throw a pinecone.',
      'Slam a stash from above or bump it from below — either pays out.',
      'Bristle only hurts himself. Trail him to the wall, then land on him while he sees stars.',
      'Chain landings without touching the ground and each is worth double the last.',
      'A golden log is usually one jump above the path you were about to take.',
    ],
  },
  {
    slug: 'freedoom',
    title: 'Freedoom',
    genre: 'Shooter',
    badge: 'NEW',
    playable: true,
    playPath: '/freedoom/',
    art: '/media/freedoom-card.webp',
    stageArt: '/media/freedoom-stage.webp',
    icon: '/freedoom/icon.svg',
    tagline: 'Phase 2 · 32 levels',
    seo: {
      title: 'Freedoom — free first-person shooter online | Beaver Games',
      description:
        'Play Freedoom: Phase 2 free in your browser: the open-source first-person shooter with 32 levels. Mouse and keyboard, touch or gamepad. Nothing to install.',
    },
    share: 'The free, open-source first-person shooter. Thirty-two levels.',
    ogImage: '/media/og/freedoom.jpg',
    // Not ours: this one is the Freedoom project's game, hosted here. The
    // game page credits them, and the structured data names them as author.
    author: { name: 'The Freedoom project', url: 'https://freedoom.github.io/' },
    blurb: 'The free, open-source first-person shooter. Thirty-two levels of corridors, keys and things that want you dead.',
    about: [
      'Freedoom: Phase 2 is a complete first-person shooter made by volunteers and given away: its own thirty-two levels, its own monsters, weapons, art and music, all under a free licence. This is that game, unmodified, running in a browser tab. Find the keys, open the doors, mind your ammunition, and look for the walls that are not quite walls.',
      'It runs on Crispy Doom, an open-source engine, compiled to WebAssembly for this page. The first play downloads about 12 MB; after that it works offline. The game keeps its own saves and settings on this device, in the menu under Save Game and Options. The arcade adds one thing the game does not have, a score: points for each level finished, more for kills, secrets and speed, and more again on the harder skill levels. A run ends when you die.',
    ],
    stats: { rating: '—', size: '12 MB', runTime: '5–15 min a level', players: '1' },
    meta: { developer: 'Freedoom project', released: '2024 · v0.13', releasedISO: '2024', genreLine: 'Shooter · First-person' },
    capabilities: ['Mouse', 'Keyboard', 'Touch', 'Gamepad', 'Offline', 'Saves', 'Open source'],
    controls: [
      { key: 'W A S D', desc: 'Move and strafe · arrow keys also move and turn' },
      { key: 'MOUSE', desc: 'Turn. Click the game first to capture the pointer' },
      { key: 'CLICK', desc: 'Fire · F on the keyboard' },
      { key: 'E', desc: 'Open doors and press switches · Space does the same' },
      { key: '1–7', desc: 'Change weapon · or the mouse wheel' },
      { key: 'ESC', desc: 'Menu: save, load, options, skill level' },
    ],
    tips: [
      'Save often. It is in the menu, and it is not cheating.',
      'A wall with a slightly different texture is worth pressing Use on.',
      'Strafing around a corner beats walking round it face first.',
      'Score counts kills, secrets and pace, and doubles on the hardest skill.',
      'On a phone, turn it sideways: the picture gets much bigger.',
    ],
  },
];

export const PLAYABLE = GAMES.filter((g) => g.playable);
export const GAME_SLUGS = PLAYABLE.map((g) => g.slug);

export function gameBySlug(slug) {
  return GAMES.find((g) => g.slug === slug) || null;
}
