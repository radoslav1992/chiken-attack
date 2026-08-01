/*
 * Whittle & Wares — the economy.
 *
 * Pure module: no `window`, no `document`, no `Math.random`. Every random draw
 * comes from a seeded generator passed in. That is what makes it possible to
 * simulate thirty in-game days of several different play strategies in Node in
 * a few milliseconds and ask the only questions that matter about a tycoon loop:
 *
 *   Can a careless player lose?      (if not, there is no game)
 *   Can a careful player win?        (if not, it is a punishment)
 *   Is any one item the whole game?  (if so, the other seven are decoration)
 *
 * Those are checked by ww-balance.mjs, not by feel. A shop sim balanced by feel
 * is balanced for the person who wrote it and nobody else.
 */

/* --- Seeded randomness ----------------------------------------------------
 * A day's market, its customers and its map all come from one seed, so a run is
 * reproducible from its number — which is what lets a balance failure be
 * re-examined instead of re-rolled.
 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    // xorshift32: small, fast, and good enough for shopkeeping.
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
  next.pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))];
  /** Weighted pick: `weights[i]` is the relative chance of `arr[i]`. */
  next.weighted = (arr, weights) => {
    let total = 0;
    for (const w of weights) total += w;
    let r = next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  };
  return next;
}

/* --- Items ----------------------------------------------------------------
 * `value` is the item's standing worth in coin — what a customer with average
 * taste pays on a day with average demand. Everything else in the economy is a
 * multiplier on it.
 *
 * `zone` is which patch of wood the raw material comes from, and is the gate on
 * the whole progression: the good materials are behind tools.
 */
export const ITEMS = {
  bark: { name: 'Birch Bark', value: 4, zone: 0, colour: '#e8dcc0', spoils: 0 },
  berry: { name: 'Bramble Berries', value: 6, zone: 0, colour: '#c2385f', spoils: 3 },
  resin: { name: 'Pine Resin', value: 10, zone: 0, colour: '#e0a423', spoils: 0 },
  clay: { name: 'River Clay', value: 9, zone: 1, colour: '#a4705a', spoils: 0 },
  flint: { name: 'Flint', value: 14, zone: 1, colour: '#7d8794', spoils: 0 },
  honey: { name: 'Wild Honey', value: 22, zone: 1, colour: '#f0b429', spoils: 5 },
  ironwood: { name: 'Ironwood', value: 30, zone: 2, colour: '#5d4433', spoils: 0 },
  amber: { name: 'Amber', value: 40, zone: 3, colour: '#ff9f1c', spoils: 0 },

  // Crafted. Made at the workbench, worth more than their parts, and the only
  // way the late game pays the late rent.
  basket: { name: 'Bark Basket', value: 34, crafted: true, colour: '#d8b48a', spoils: 0 },
  pot: { name: 'Clay Pot', value: 40, crafted: true, colour: '#b5754f', spoils: 0 },
  jam: { name: 'Bramble Jam', value: 62, crafted: true, colour: '#8e2246', spoils: 8 },
  hatchet: { name: 'Flint Hatchet', value: 96, crafted: true, colour: '#8b949e', spoils: 0 },
  charm: { name: 'Amber Charm', value: 150, crafted: true, colour: '#ffb43d', spoils: 0 },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const RAW_IDS = ITEM_IDS.filter((id) => !ITEMS[id].crafted);
export const CRAFTED_IDS = ITEM_IDS.filter((id) => ITEMS[id].crafted);

/* --- Recipes --------------------------------------------------------------
 * Margins run 1.4x to 2.5x on materials. The cheap recipes are the better deal
 * per unit of shelf space early, the expensive ones per unit of foraging time
 * later — which is the whole reason to keep making baskets after you can make
 * charms.
 */
export const RECIPES = {
  basket: { bark: 2, resin: 1 },
  pot: { clay: 2, resin: 1 },
  jam: { berry: 3, honey: 1 },
  hatchet: { flint: 1, ironwood: 1, resin: 1 },
  charm: { amber: 1, resin: 1, bark: 1 },
};

/** The two the Master Bench adds. Everything else you can make from day one. */
export const MASTER_RECIPES = ['hatchet', 'charm'];

export function recipeOpen(id, upgrades) {
  return !MASTER_RECIPES.includes(id) || upgrades.includes('masterBench');
}

export function openRecipes(upgrades) {
  return Object.keys(RECIPES).filter((id) => recipeOpen(id, upgrades));
}

/** What the materials for one of these cost at standing value. */
export function recipeCost(id) {
  const r = RECIPES[id];
  if (!r) return 0;
  let sum = 0;
  for (const k in r) sum += ITEMS[k].value * r[k];
  return sum;
}

export function canCraft(inv, id, upgrades = []) {
  const r = RECIPES[id];
  if (!r || !recipeOpen(id, upgrades)) return false;
  for (const k in r) if ((inv[k] || 0) < r[k]) return false;
  return true;
}

/* --- Upgrades -------------------------------------------------------------
 * Deliberately more than a run can afford. Choosing which three to buy first is
 * the tycoon decision; if you could buy them all there would be nothing to
 * decide.
 */
export const UPGRADES = [
  { id: 'boots', name: 'Oiled Boots', cost: 120, blurb: '+30 stamina. More time in the wood each morning.' },
  /* The workbench used to be a 220-coin upgrade, which measured out at a median
   * of day FOUR before a player could craft anything at all. Three days of "walk
   * out, pick things up, sell them" is the whole game for most of a first
   * session, and it is not enough of one. Everyone has a bench now; what you buy
   * is the good half of the recipe book. */
  { id: 'masterBench', name: 'Master Bench', cost: 260, blurb: 'Unlocks the Flint Hatchet and Amber Charm — the two best things you can make.' },
  { id: 'shelves', name: 'Wider Shelves', cost: 160, blurb: 'Shop holds 22 goods instead of 12.' },
  { id: 'sign', name: 'Painted Sign', cost: 200, blurb: '+4 customers a day.' },
  { id: 'axe', name: 'Steel Axe', cost: 240, blurb: 'Opens the Ironwood Stand, and every node gives one more.' },
  { id: 'lantern', name: 'Lantern', cost: 300, blurb: 'Opens the Deep Hollow, where the amber is.' },
  { id: 'ledger', name: "Trader's Ledger", cost: 280, blurb: 'See exactly what each customer will pay.' },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/* --- Zones ----------------------------------------------------------------
 * Four bands of one wood, running away from the shop. Deeper pays better but
 * costs stamina to walk to, and each band holds only so many nodes in a day —
 * which is the point. With unlimited nodes the deepest open band was simply the
 * answer, every day: the balance sim had amber at 53% of all revenue and bark,
 * berries, resin, baskets and charms at zero. A finite patch means a deep run
 * ends early and you gather your way home, and the shallow goods are what the
 * best recipes are made of.
 *
 * `travel` is stamina to reach the band from the shop, so walking home through
 * the shallows is free of anything but the gathering.
 */
export const ZONES = [
  { id: 0, name: 'Willow Bank', needs: null, travel: 0, nodes: 10, items: ['bark', 'bark', 'berry', 'berry', 'resin'], hazard: 0.08 },
  { id: 1, name: 'Stone Ford', needs: null, travel: 6, nodes: 8, items: ['clay', 'clay', 'flint', 'bark', 'berry'], hazard: 0.26 },
  { id: 2, name: 'Ironwood Stand', needs: 'axe', travel: 13, nodes: 6, items: ['ironwood', 'ironwood', 'resin', 'flint', 'honey'], hazard: 0.42 },
  { id: 3, name: 'Deep Hollow', needs: 'lantern', travel: 21, nodes: 5, items: ['amber', 'ironwood', 'honey', 'clay', 'resin'], hazard: 0.58 },
];

/** Stamina per node: the gather itself plus the walk between nodes in a band. */
export const NODE_COST = 7;

export function zoneOpen(zone, upgrades) {
  return !zone.needs || upgrades.includes(zone.needs);
}

/* --- Rent -----------------------------------------------------------------
 * The clock the whole game runs against. It comes due every fifth day and grows
 * faster than a static strategy can, so standing still is losing slowly.
 */
export const RENT_EVERY = 5;

export function rentDue(day) {
  if (day % RENT_EVERY !== 0) return 0;
  const period = day / RENT_EVERY;
  return Math.round(120 * Math.pow(1.52, period - 1));
}

/** Every rent payment up to and including `day`. Used by the balance sim. */
export function rentThrough(day) {
  let sum = 0;
  for (let d = 1; d <= day; d++) sum += rentDue(d);
  return sum;
}

/* --- The daily market -----------------------------------------------------
 * Two goods are wanted and one is glutted, redrawn every morning. This is the
 * information the player is reading when they set prices, and the reason the
 * right answer changes from day to day rather than being solved once.
 */
export function dailyMarket(day, rng) {
  const pool = ITEM_IDS.slice();
  const hot = [];
  for (let i = 0; i < 2; i++) {
    const pick = rng.int(0, pool.length - 1);
    hot.push(pool.splice(pick, 1)[0]);
  }
  const cold = pool[rng.int(0, pool.length - 1)];
  const mult = {};
  for (const id of ITEM_IDS) mult[id] = 1;
  for (const id of hot) mult[id] = 1.45;
  mult[cold] = 0.7;
  return { day, hot, cold, mult };
}

/* --- Customers ------------------------------------------------------------
 * A customer is a want and a number: the most they will pay for it today. The
 * number is private unless you have bought the Ledger, which is what that
 * upgrade is actually selling — not money, but the removal of guessing.
 */
const FIRST = ['Bramble', 'Ash', 'Wren', 'Otter', 'Fen', 'Moss', 'Pike', 'Rowan', 'Heather', 'Vole', 'Elm', 'Tansy'];
const LAST = ['Nutkin', 'Thistledown', 'Reedy', 'Burrows', 'Quickpaw', 'Hollow', 'Greenwater', 'Stonepaw'];

export function customerCount(day, rep, upgrades, rng) {
  const base = 4 + Math.min(6, Math.floor(day / 3));
  /* Asymmetric on purpose. Good standing brings people in twice as fast as bad
   * standing drives them away, because symmetric footfall made the whole game a
   * knife-edge: the markup sweep went from 94% survival at x1.2 to 19% at x1.3
   * to zero at x1.4, and every one of those deaths was the same spiral —
   * walkouts cost reputation, reputation cost footfall, less footfall meant
   * fewer sales and more desperate pricing. A bad week should hurt, not be
   * unrecoverable. */
  const fromRep = rep >= 0 ? Math.round(rep / 12) : Math.round(rep / 26);
  const fromSign = upgrades.includes('sign') ? 4 : 0;
  return Math.max(4, base + fromRep + fromSign + rng.int(-1, 1));
}

/**
 * Draw one customer. `stock` is the list of item ids currently on the shelves;
 * a customer asks for something you actually have, because a shop full of
 * people asking for goods you have never heard of is not a game, it is weather.
 */
export function makeCustomer(day, rep, market, stock, rng) {
  const choices = stock.length ? stock : RAW_IDS;
  /* Weight the want toward what is in demand today, so a hot good genuinely
   * draws traffic rather than only paying more when it happens to sell. */
  const weights = choices.map((id) => (market.mult[id] >= 1.4 ? 3 : market.mult[id] < 1 ? 0.7 : 1.6));
  const wants = rng.weighted(choices, weights);

  const taste = rng.range(0.78, 1.32);
  const repFactor = 1 + Math.max(-0.18, Math.min(0.22, rep / 500));
  const wtp = Math.max(1, Math.round(ITEMS[wants].value * market.mult[wants] * taste * repFactor));

  return {
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    wants,
    /* Customers buy in small lots, not singly. With one unit each, a day's
     * income was pinned to the customer count and a full shelf was worth no
     * more than an empty one — which made foraging, the entire first half of the
     * game, almost irrelevant to the second. */
    qty: rng.weighted([1, 2, 3], [4, 3, 1.5]),
    wtp,
    /** How far over their limit they will still bother to haggle rather than leave. */
    patience: rng.range(1.15, 1.4),
    haggled: false,
    day,
  };
}

/**
 * What the customer does when they see your price.
 *
 *   buy     at or under what they will pay
 *   haggle  a little over: they counter at their own limit, once
 *   leave   far over: they walk, and gouging shows up in reputation
 */
export function evaluateOffer(customer, price) {
  if (price <= customer.wtp) return 'buy';
  if (!customer.haggled && price <= customer.wtp * customer.patience) return 'haggle';
  return 'leave';
}

/* Reputation. Selling under the standing value earns goodwill, selling far over
 * it costs goodwill, and a walkout costs a little regardless. Kept small per
 * event so a run's reputation is the shape of a hundred decisions rather than
 * one. */
export function repDelta(outcome, item, price) {
  const fair = ITEMS[item].value;
  if (outcome === 'leave') return -1;
  const ratio = price / fair;
  if (ratio <= 0.85) return 2.5;
  if (ratio <= 1.15) return 1.5;
  if (ratio <= 1.45) return 0.4;
  return -1.2;
}

/** The price the shop suggests: standing value moved by today's demand. */
export function suggestedPrice(id, market) {
  return Math.max(1, Math.round(ITEMS[id].value * market.mult[id]));
}

/* --- What a price will actually do ----------------------------------------
 * Derived from the very distribution makeCustomer draws from, rather than
 * guessed at: taste is uniform over [0.78, 1.32] and patience over [1.15, 1.4],
 * so for a given price the share of customers who buy outright, haggle, or walk
 * straight out is arithmetic.
 *
 * This exists because the pricing screen used to be a number with two arrows and
 * no consequence attached. You could hold + until the price was in the
 * thousands, and nothing on screen suggested that was different from holding it
 * until the price was fair — the entire decision the game is built around was
 * invisible until the customers had already walked.
 */
const TASTE_LO = 0.78;
const TASTE_HI = 1.32;
const PATIENCE_MID = 1.275;

export function priceOutlook(id, price, market, rep = 0) {
  const repFactor = 1 + Math.max(-0.18, Math.min(0.22, rep / 500));
  const centre = Math.max(1, ITEMS[id].value * market.mult[id] * repFactor);
  const share = (r) => Math.max(0, Math.min(1, (TASTE_HI - r) / (TASTE_HI - TASTE_LO)));
  const buy = share(price / centre);
  const upTo = share(price / centre / PATIENCE_MID);
  const haggle = Math.max(0, upTo - buy);
  return { centre, buy, haggle, leave: Math.max(0, 1 - buy - haggle) };
}

/** The most the stepper will let you ask. Past about 1.32x the going rate not one
 *  customer in the wood will pay, so anything beyond twice it is a typo. */
export function priceCeiling(id, market) {
  return Math.max(2, Math.round(suggestedPrice(id, market) * 2));
}

/** A short verdict for the label beside the price. */
export function priceLabel(outlook) {
  if (outlook.buy >= 0.85) return { text: 'Everyone will take it', tone: 'cheap' };
  if (outlook.buy >= 0.5) return { text: 'Most will buy', tone: 'good' };
  if (outlook.buy + outlook.haggle >= 0.65) return { text: 'Expect haggling', tone: 'fair' };
  if (outlook.buy + outlook.haggle >= 0.3) return { text: 'Many will walk out', tone: 'dear' };
  return { text: 'Nobody will pay this', tone: 'bad' };
}

export function stockCapacity(upgrades) {
  return upgrades.includes('shelves') ? 22 : 12;
}

export function maxStamina(upgrades) {
  return 100 + (upgrades.includes('boots') ? 30 : 0);
}

/** How many units one node gives. The axe pays off on every node, not just the
 *  ironwood it unlocks, which is what stops it being a single-zone upgrade. */
export function nodeYield(upgrades, rng) {
  return (upgrades.includes('axe') ? 2 : 1) + (rng() < 0.25 ? 1 : 0);
}

/** Total count of goods held, for the shelf limit. */
export function countStock(stock) {
  let n = 0;
  for (const k in stock) n += stock[k];
  return n;
}

/* Perishables. Berries and honey rot; jam keeps a while. This is the pressure
 * that stops "forage everything, sell nothing, hoard until day 20". */
export function spoil(inv, ages) {
  const lost = {};
  for (const id in inv) {
    const life = ITEMS[id].spoils;
    if (!life || !inv[id]) continue;
    ages[id] = (ages[id] || 0) + 1;
    if (ages[id] >= life) {
      lost[id] = inv[id];
      inv[id] = 0;
      ages[id] = 0;
    }
  }
  return lost;
}

/* --- Commissions -----------------------------------------------------------
 * The reason to walk out of the door on a particular morning.
 *
 * Without these a day has no shape: you gather whatever you pass, sell whatever
 * you gathered, and the only clock is a rent five days away. An order names a
 * good, a number and a date, pays roughly twice the market for it, and turns the
 * morning from "collect things" into "collect THESE things, by Thursday" — which
 * is the difference between a shop and a treadmill.
 *
 * They are deliberately larger than a single day's gathering, so taking one is a
 * commitment across days rather than a free bonus for what you happened to pick
 * up.
 */

const ORDER_NAMES = [
  'the Ferryman', 'Widow Thorn', 'the Miller', 'Bracken Hall', 'the Ford Inn',
  'the Charcoal Burner', 'Sister Wren', 'the Bell Foundry', 'the Roadwarden',
];

/** Everything the player could plausibly supply right now. */
export function supplyable(upgrades) {
  const raw = new Set();
  for (const z of ZONES) {
    if (!zoneOpen(z, upgrades)) continue;
    for (const item of z.items) raw.add(item);
  }
  /* Only things worth commissioning. A standing order for four bits of bark
   * pays 22 coin and reads as an errand; the point of an order is to be a reason
   * to plan a morning around it. */
  const out = [...raw].filter((id) => ITEMS[id].value >= 9);
  for (const id of openRecipes(upgrades)) {
    if (Object.keys(RECIPES[id]).every((k) => raw.has(k))) out.push(id);
  }
  return out;
}

/** Days you are given to fill an order, and what it pays over the market. */
const ORDER_DAYS = 3;
const ORDER_MULT = 1.85;

export function makeOrder(day, rng, upgrades, seq = 0) {
  const pool = supplyable(upgrades);
  /* Weighted toward things you have to MAKE rather than merely find, because a
   * commission for four bits of bark is not a plan, it is an errand. */
  const weights = pool.map((id) => (ITEMS[id].crafted ? 3 : ITEMS[id].value >= 14 ? 2 : 1));
  const item = rng.weighted(pool, weights);
  const qty = ITEMS[item].crafted ? rng.int(2, 3) : rng.int(3, 6);
  const pay = Math.round(ITEMS[item].value * qty * ORDER_MULT);
  return {
    id: `${day}-${seq}`,
    from: rng.pick(ORDER_NAMES),
    item,
    qty,
    due: day + ORDER_DAYS,
    pay,
  };
}

/** How many commissions you may hold at once. A second opens up once you are
 *  known well enough for two people to ask on the same week. */
export function orderSlots(rep) {
  return rep >= 45 ? 2 : 1;
}

export function orderFillable(order, inv) {
  return (inv[order.item] || 0) >= order.qty;
}

/** Reputation swing for delivering, and for letting one lapse. */
export const ORDER_REP = { done: 6, failed: -8 };
