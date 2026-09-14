export const WIDTH = 960,
  HEIGHT = 600,
  CAMPAIGN_WAVES = 12;
export const TOWERS = {
  acorn: {
    name: 'Acorn turret',
    icon: '◉',
    cost: 55,
    damage: 14,
    range: 145,
    rate: 0.8,
    colour: '#e1a44c',
    description: 'Fast shots. Reliable against runners and flying raiders.',
  },
  log: {
    name: 'Log launcher',
    icon: '▰',
    cost: 85,
    damage: 28,
    range: 160,
    rate: 2.2,
    colour: '#ba7953',
    description: 'Heavy splash damage. Break up tightly packed ground enemies.',
  },
  bramble: {
    name: 'Bramble garden',
    icon: '✳',
    cost: 65,
    damage: 5,
    range: 112,
    rate: 1.1,
    colour: '#a6bf76',
    description: 'Slows nearby ground enemies, giving your turrets more time.',
  },
  mill: {
    name: 'Watermill',
    icon: '✥',
    cost: 75,
    damage: 0,
    range: 0,
    rate: 1,
    colour: '#81c7c3',
    description:
      'Earns 16 extra wood after every wave. Helps refill the reservoir.',
  },
  watch: {
    name: 'Watchtower',
    icon: '⌁',
    cost: 100,
    damage: 32,
    range: 215,
    rate: 2.1,
    colour: '#dac796',
    description:
      'Long range. Piercing shots ignore armour and reach flying foes.',
  },
};
export const MAPS = [
  {
    id: 'willow',
    name: 'Willow Bend',
    subtitle: 'One river. One little village.',
    difficulty: 'Gentle start',
    sky: '#c4debc',
    land: '#abc89a',
    dark: '#7ea378',
    water: '#69b7b4',
    boss: 'Timberjaw',
    bossType: 'boar',
    river: [
      [465, -50],
      [500, 110],
      [390, 210],
      [455, 340],
      [470, 440],
      [480, 660],
    ],
    paths: [
      [
        [45, -20],
        [145, 85],
        [270, 115],
        [312, 220],
        [255, 315],
        [340, 407],
        [400, 505],
        [475, 532],
      ],
    ],
    pads: [
      [130, 175],
      [225, 215],
      [355, 125],
      [355, 295],
      [180, 325],
      [330, 505],
      [420, 420],
      [555, 400],
      [575, 510],
      [580, 225],
      [670, 370],
      [680, 500],
    ],
    trees: [
      [45, 275],
      [90, 400],
      [150, 505],
      [70, 545],
      [640, 90],
      [700, 165],
      [825, 95],
      [860, 270],
      [780, 415],
      [890, 485],
    ],
  },
  {
    id: 'fork',
    name: 'Copper Fork',
    subtitle: 'Two banks. Twice the trouble.',
    difficulty: 'Split defence',
    sky: '#ead5ab',
    land: '#c9bd85',
    dark: '#a39e68',
    water: '#75b9b5',
    boss: 'Captain Bristle',
    bossType: 'raider',
    river: [
      [470, -50],
      [430, 125],
      [505, 240],
      [440, 355],
      [480, 460],
      [480, 660],
    ],
    paths: [
      [
        [20, 30],
        [160, 95],
        [230, 210],
        [170, 330],
        [315, 430],
        [460, 533],
      ],
      [
        [940, 20],
        [800, 100],
        [710, 220],
        [780, 335],
        [620, 430],
        [500, 533],
      ],
    ],
    pads: [
      [100, 205],
      [300, 115],
      [305, 310],
      [210, 440],
      [380, 410],
      [345, 530],
      [650, 140],
      [830, 220],
      [655, 315],
      [755, 440],
      [575, 410],
      [615, 530],
    ],
    trees: [
      [45, 430],
      [65, 540],
      [390, 100],
      [570, 95],
      [920, 400],
      [890, 535],
      [60, 115],
      [880, 100],
    ],
  },
  {
    id: 'marsh',
    name: 'Moonwater Marsh',
    subtitle: 'Hold the line under the fireflies.',
    difficulty: 'Wild waters',
    sky: '#8799a2',
    land: '#739790',
    dark: '#527970',
    water: '#91ccc2',
    boss: 'Stormwing',
    bossType: 'heron',
    river: [
      [520, -50],
      [415, 105],
      [515, 205],
      [425, 310],
      [475, 425],
      [480, 660],
    ],
    paths: [
      [
        [20, 50],
        [150, 115],
        [265, 175],
        [200, 295],
        [305, 415],
        [460, 533],
      ],
      [
        [940, 90],
        [805, 175],
        [705, 145],
        [665, 290],
        [720, 380],
        [560, 465],
        [500, 533],
      ],
    ],
    pads: [
      [130, 235],
      [300, 85],
      [350, 230],
      [130, 360],
      [215, 455],
      [380, 455],
      [590, 150],
      [800, 285],
      [590, 325],
      [820, 430],
      [630, 500],
      [555, 535],
    ],
    trees: [
      [60, 475],
      [115, 550],
      [370, 65],
      [620, 65],
      [910, 480],
      [900, 45],
      [900, 270],
    ],
  },
];
export const CAPTAINS = [
  {
    id: 'moss',
    name: 'Moss',
    title: 'The steady paw',
    description: '+20 dam strength.',
    unlock: 0,
  },
  {
    id: 'pip',
    name: 'Pip',
    title: 'The resourceful one',
    description: 'Acorn turrets cost 15 less wood.',
    unlock: 1,
  },
  {
    id: 'fern',
    name: 'Fern',
    title: 'Keeper of the thicket',
    description: 'Bramble slows last 60% longer.',
    unlock: 2,
  },
];
export const ENEMIES = {
  raider: {
    name: 'Raccoon raiders',
    hp: 26,
    speed: 38,
    reward: 6,
    damage: 8,
    armour: 0,
  },
  runner: {
    name: 'Swift foxes',
    hp: 18,
    speed: 66,
    reward: 6,
    damage: 7,
    armour: 0,
  },
  boar: {
    name: 'Armoured boars',
    hp: 63,
    speed: 29,
    reward: 10,
    damage: 16,
    armour: 0.45,
  },
  heron: {
    name: 'Flying herons',
    hp: 31,
    speed: 48,
    reward: 8,
    damage: 10,
    armour: 0,
    flying: true,
  },
};
export const PERKS = [
  {
    id: 'sharp',
    name: 'Sharper acorns',
    text: 'Acorn turrets deal 25% more damage.',
    max: 3,
  },
  {
    id: 'long',
    name: 'Lookout branches',
    text: 'All attacking towers gain 15% range.',
    max: 2,
  },
  {
    id: 'deep',
    name: 'Deep reservoir',
    text: '+25 water capacity. Refill 25 water now.',
    max: 3,
  },
  {
    id: 'torrent',
    name: 'Wild current',
    text: 'Floods deal 35% more damage.',
    max: 3,
  },
  {
    id: 'grove',
    name: 'Living barricade',
    text: '+20 maximum dam strength. Repair 20 now.',
    max: 3,
  },
  {
    id: 'salvage',
    name: 'Salvage crew',
    text: 'Every defeated enemy drops 2 extra wood.',
    max: 2,
  },
  { id: 'quick', name: 'Busy paws', text: 'Towers fire 15% faster.', max: 3 },
  {
    id: 'millwright',
    name: 'Millwright’s craft',
    text: 'Watermills earn 10 more wood per wave.',
    max: 3,
  },
  {
    id: 'gift',
    name: 'Woodland windfall',
    text: 'Receive 100 wood now.',
    max: 99,
  },
];
export function hash(text) {
  let value = 2166136261;
  for (const c of String(text))
    value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
export function validDay(day) {
  return (
    typeof day === 'string' &&
    /^20\d{2}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    utcDay(new Date(day)) === day
  );
}
export function dailyConfig(day = utcDay()) {
  const date = validDay(day) ? day : utcDay();
  const seed = hash(`dam-defender-v1-${date}`);
  return { seed, map: seed % MAPS.length, captain: 'moss', daily: date };
}
export function challengeConfig(search) {
  const p = new URLSearchParams(search);
  if (validDay(p.get('daily'))) return dailyConfig(p.get('daily'));
  const seed = p.get('seed'),
    map = Number(p.get('river'));
  if (
    !seed ||
    !/^\d{1,10}$/.test(seed) ||
    Number(seed) > 4294967295 ||
    !Number.isInteger(map) ||
    map < 0 ||
    map >= MAPS.length
  )
    return null;
  const captain = CAPTAINS.some((c) => c.id === p.get('captain'))
    ? p.get('captain')
    : 'moss';
  return { seed: Number(seed), map, captain, daily: null };
}
export function challengeUrl(state, origin) {
  const url = new URL('/games/dam-defender/', origin);
  url.searchParams.set('play', '1');
  if (state.daily) url.searchParams.set('daily', state.daily);
  else {
    url.searchParams.set('seed', String(state.seed));
    url.searchParams.set('river', String(state.map));
    url.searchParams.set('captain', state.captain);
  }
  url.searchParams.set(
    'challenge',
    String(Math.min(100000000, Math.floor(state.score))),
  );
  return url.href;
}
