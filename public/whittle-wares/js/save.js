import { ITEMS, UPGRADE_BY_ID } from './economy.js';
import { MAP_W, MAP_H } from './world.js';

export const SAVE_FIELDS =
  `seed day gold rep inv ages upgrades prices takings sold walkouts bestDay
  orders offer ordersDone ordersFailed coachDone overReason phase market stamina maxStam gathered
  dayTakings daySold dayWalkouts px py facing stun wasps shelf queue customer awaitingHaggle
  shopOpen spoiled orderNews progress progressNews won rankedScore scoreId customerView`.split(
    /\s+/,
  );

export function snapshot(game) {
  const state = Object.fromEntries(SAVE_FIELDS.map((k) => [k, game[k]]));
  return JSON.parse(
    JSON.stringify({
      ...state,
      v: 2,
      rngState: game.rng.state(),
      map: { ...game.map, tiles: Array.from(game.map.tiles) },
    }),
  );
}

const obj = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const num = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1e12;
const count = (value) => num(value) && Number.isInteger(value) && value >= 0;
const stock = (value) =>
  obj(value) &&
  Object.entries(value).every(
    ([id, n]) => Object.hasOwn(ITEMS, id) && count(n),
  );
const point = (p) =>
  obj(p) &&
  num(p.x) &&
  num(p.y) &&
  p.x >= 0 &&
  p.x < MAP_W &&
  p.y >= 0 &&
  p.y < MAP_H;
const order = (o) =>
  obj(o) &&
  Object.hasOwn(ITEMS, o.item) &&
  count(o.qty) &&
  o.qty > 0 &&
  count(o.due) &&
  count(o.pay) &&
  typeof o.from === 'string';

// Validate before touching a running game; a broken save must not half-restore it.
export function validSave(s) {
  try {
    if (
      !obj(s) ||
      ![1, 2].includes(s.v) ||
      !count(s.seed) ||
      !count(s.day) ||
      s.day < 1 ||
      s.day > 100000
    )
      return false;
    if (
      !num(s.gold) ||
      !num(s.rep) ||
      !stock(s.inv) ||
      !stock(s.ages || {}) ||
      !stock(s.prices || {})
    )
      return false;
    if (
      !Array.isArray(s.upgrades) ||
      !s.upgrades.every(
        (id) =>
          Object.hasOwn(UPGRADE_BY_ID, id) ||
          /^(trail|display|hospitality|artisan)[1-5]$/.test(id),
      )
    )
      return false;
    if (
      !Array.isArray(s.orders || []) ||
      !(s.orders || []).every(order) ||
      (s.offer && !order(s.offer))
    )
      return false;
    for (const k of [
      'takings',
      'sold',
      'walkouts',
      'ordersDone',
      'ordersFailed',
    ])
      if (!count(s[k] || 0)) return false;
    if (s.v === 1) return true;
    if (
      !['forage', 'craft', 'shop', 'serving', 'evening', 'over'].includes(
        s.phase,
      )
    )
      return false;
    if (
      !count(s.rngState) ||
      !num(s.px) ||
      !num(s.py) ||
      !num(s.stamina) ||
      !num(s.maxStam)
    )
      return false;
    if (
      !obj(s.map) ||
      !Array.isArray(s.map.tiles) ||
      s.map.tiles.length !== MAP_W * MAP_H ||
      !s.map.tiles.every((t) => count(t) && t <= 9)
    )
      return false;
    if (
      !point(s.map.spawn) ||
      !Array.isArray(s.map.nodes) ||
      !s.map.nodes.every((n) => point(n) && Object.hasOwn(ITEMS, n.item))
    )
      return false;
    if (
      !Array.isArray(s.map.hazards) ||
      !s.map.hazards.every(point) ||
      !Array.isArray(s.wasps)
    )
      return false;
    if (
      !s.wasps.every((w) => ['x', 'y', 'life', 'cool'].every((k) => num(w[k])))
    )
      return false;
    if (
      !obj(s.market) ||
      !Array.isArray(s.market.hot) ||
      !s.market.hot.every((id) => Object.hasOwn(ITEMS, id)) ||
      !Object.hasOwn(ITEMS, s.market.cold)
    )
      return false;
    if (
      !obj(s.market.mult) ||
      !Object.keys(ITEMS).every(
        (id) => num(s.market.mult[id]) && s.market.mult[id] > 0,
      )
    )
      return false;
    if (!stock(s.shelf || {}) || !Array.isArray(s.queue || [])) return false;
    if (
      s.phase === 'serving' &&
      (!obj(s.customer) ||
        !Object.hasOwn(ITEMS, s.customer.wants) ||
        !num(s.customer.wtp) ||
        !count(s.customer.qty) ||
        !['haggle', 'sold', 'left'].includes(s.customerView?.what))
    )
      return false;
    if (
      s.phase === 'serving' &&
      s.customerView.what === 'sold' &&
      !['qty', 'unitPrice', 'total'].every((k) => num(s.customerView.deal?.[k]))
    )
      return false;
    const p = s.progress;
    if (
      !obj(p) ||
      ![
        'gathered',
        'crafted',
        'sold',
        'orders',
        'revenue',
        'stamps',
        'season',
      ].every((k) => count(p[k]))
    )
      return false;
    if (
      !stock(p.made) ||
      !stock(p.found) ||
      !Array.isArray(p.badges) ||
      !Array.isArray(p.claimed) ||
      !obj(p.baseline)
    )
      return false;
    if (
      !Object.values(p.baseline).every(count) ||
      !Array.isArray(s.progressNews)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
