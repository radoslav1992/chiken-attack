import { ITEMS } from './economy.js';

export const SEASON_DAYS = 10;
export const SEASONS = [
  {
    name: 'Blossom',
    subtitle: 'The woodland wakes',
    colour: '#accb8b',
    goods: ['bark', 'basket', 'resin'],
  },
  {
    name: 'Suncrest',
    subtitle: 'Long days, sweet harvests',
    colour: '#eac66a',
    goods: ['berry', 'jam', 'honey'],
  },
  {
    name: 'Copperfall',
    subtitle: 'A season for makers',
    colour: '#de9971',
    goods: ['clay', 'pot', 'hatchet', 'chest'],
  },
  {
    name: 'Frostglow',
    subtitle: 'Light up the long nights',
    colour: '#9ecbd8',
    goods: ['amber', 'charm', 'chime', 'clock'],
  },
];

export function seasonAt(day) {
  const index = Math.floor((Math.max(1, day) - 1) / SEASON_DAYS);
  return {
    ...SEASONS[index % 4],
    index,
    year: Math.floor(index / 4) + 1,
    day: ((day - 1) % SEASON_DAYS) + 1,
    left: SEASON_DAYS - ((day - 1) % SEASON_DAYS),
  };
}

export function eventAt(day) {
  if (day % 5 === 0)
    return {
      name: 'Market caravan',
      text: 'Four extra customers visit today.',
      customers: 4,
    };
  if (day % 3 === 0)
    return {
      name: 'Forest bounty',
      text: 'Bark, berries and resin give one extra per node.',
      bounty: true,
    };
  if (day % 4 === 0)
    return { name: 'Clear trails', text: 'Walk 20% faster today.', speed: 1.2 };
  return {
    name: 'Workshop day',
    text: 'Crafted goods fetch 15% more today.',
    craft: 1.15,
  };
}

export function seasonalMarket(market, day, upgrades) {
  const season = seasonAt(day),
    event = eventAt(day);
  const skill = upgrades.filter((id) => /^artisan[1-5]$/.test(id)).length;
  for (const id of Object.keys(ITEMS)) {
    if (season.goods.includes(id)) market.mult[id] *= 1.18;
    if (ITEMS[id].crafted)
      market.mult[id] *= (event.craft || 1) * (1 + skill * 0.04);
  }
  return market;
}

export function newProgress() {
  return {
    gathered: 0,
    crafted: 0,
    sold: 0,
    orders: 0,
    revenue: 0,
    made: {},
    found: {},
    stamps: 0,
    badges: [],
    season: -1,
    baseline: {},
    claimed: [],
  };
}

export function beginSeason(progress, day) {
  const index = seasonAt(day).index;
  if (progress.season === index) return;
  progress.season = index;
  progress.baseline = Object.fromEntries(
    ['gathered', 'crafted', 'sold', 'orders', 'revenue'].map((k) => [
      k,
      progress[k],
    ]),
  );
  progress.claimed = [];
}

export function seasonGoals(progress) {
  const tier = Math.min(4, Math.floor(Math.max(0, progress.season) / 4));
  const rotations = [
    [
      ['gathered', 'Gather woodland supplies', 45],
      ['crafted', 'Work the bench', 6],
      ['sold', 'Stock the village', 35],
    ],
    [
      ['gathered', 'Bring in the harvest', 55],
      ['orders', 'Keep your promises', 2],
      ['revenue', 'A thriving market', 650],
    ],
    [
      ['crafted', 'Made by hand', 10],
      ['sold', 'Busy counter', 45],
      ['orders', 'Village commissions', 2],
    ],
    [
      ['revenue', 'Light up the ledger', 850],
      ['crafted', 'Winter workshop', 8],
      ['gathered', 'Winter stores', 60],
    ],
  ];
  return rotations[Math.max(0, progress.season) % 4].map(([id, name, base]) => {
    const target = Math.round(base * (1 + tier * 0.25));
    return {
      id,
      name,
      target,
      value: Math.min(target, progress[id] - (progress.baseline[id] || 0)),
      done: progress.claimed.includes(id),
      reward: 60 + tier * 30,
    };
  });
}

export const BADGES = [
  {
    id: 'first',
    name: 'First creation',
    text: 'Craft your first item',
    goal: (p) => p.crafted,
    target: 1,
  },
  {
    id: 'maker',
    name: 'Village maker',
    text: 'Craft 50 items',
    goal: (p) => p.crafted,
    target: 50,
  },
  {
    id: 'master',
    name: 'Master of the wood',
    text: 'Craft 250 items',
    goal: (p) => p.crafted,
    target: 250,
  },
  {
    id: 'trader',
    name: 'Market favourite',
    text: 'Sell 250 goods',
    goal: (p) => p.sold,
    target: 250,
  },
  {
    id: 'merchant',
    name: 'Merchant legend',
    text: 'Sell 1,000 goods',
    goal: (p) => p.sold,
    target: 1000,
  },
  {
    id: 'trusted',
    name: 'A promise kept',
    text: 'Deliver 10 commissions',
    goal: (p) => p.orders,
    target: 10,
  },
  {
    id: 'collector',
    name: 'Every corner',
    text: 'Find all 8 raw materials',
    goal: (p) => Object.keys(p.found).length,
    target: 8,
  },
  {
    id: 'catalogue',
    name: 'Signature collection',
    text: 'Make all 8 crafted goods',
    goal: (p) => Object.keys(p.made).length,
    target: 8,
  },
];

// Rewards are granted atomically with the action and persisted with it.
export function claimProgress(progress) {
  const news = [];
  let gold = 0;
  for (const goal of seasonGoals(progress)) {
    if (goal.done || goal.value < goal.target) continue;
    progress.claimed.push(goal.id);
    progress.stamps++;
    gold += goal.reward;
    news.push(`${goal.name}: +${goal.reward} coin, +1 guild stamp`);
  }
  for (const badge of BADGES) {
    if (
      progress.badges.includes(badge.id) ||
      badge.goal(progress) < badge.target
    )
      continue;
    progress.badges.push(badge.id);
    progress.stamps += 2;
    news.push(`${badge.name}: +2 guild stamps`);
  }
  return { gold, news };
}

export const SPECIALISATIONS = [
  {
    id: 'trail',
    name: 'Trailcraft',
    text: '+8 stamina and +5% walking speed per level.',
  },
  { id: 'display', name: 'Shop expansion', text: '+4 shelf spaces per level.' },
  {
    id: 'hospitality',
    name: 'Village gathering place',
    text: '+1 customer per day per level.',
  },
  {
    id: 'artisan',
    name: 'Artisan workshop',
    text: '+4% crafted prices per level. Chimes at I, chests at III, clocks at V.',
  },
];

export function specialisation(upgrades, id) {
  const level = upgrades.filter((u) =>
    new RegExp(`^${id}[1-5]$`).test(u),
  ).length;
  return {
    level,
    next: `${id}${level + 1}`,
    gold: 350 + level * 220,
    stamps: 2 + level,
    max: level >= 5,
  };
}
