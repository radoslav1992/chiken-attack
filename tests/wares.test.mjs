import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng,
  ITEMS,
  RECIPES,
  rentDue,
  spoil,
  dailyMarket,
  supplyable,
} from '../public/whittle-wares/js/economy.js';
import {
  seasonAt,
  seasonGoals,
  newProgress,
  beginSeason,
  claimProgress,
  specialisation,
} from '../public/whittle-wares/js/progression.js';
import { validSave } from '../public/whittle-wares/js/save.js';
import { TILE, MAP_W, reachable } from '../public/whittle-wares/js/world.js';

const gradient = { addColorStop() {} };
const ctx = new Proxy(
  {
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => gradient,
  },
  {
    get: (o, k) =>
      k in o
        ? o[k]
        : (...args) =>
            assert.ok(
              args.every((a) => typeof a !== 'number' || Number.isFinite(a)),
              String(k),
            ),
    set: (o, k, v) => ((o[k] = v), true),
  },
);
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
};
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
const { Game } = await import('../public/whittle-wares/js/game.js');
const create = (seed = 12345) => {
  const g = new Game({
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 390, height: 844 }),
  });
  g.newRun(seed);
  return g;
};
const clone = (g) => {
  const s = g.snapshot();
  assert.equal(validSave(s), true, `valid ${g.phase} checkpoint`);
  const h = create();
  assert.equal(h.restore(s), true);
  assert.deepEqual(h.snapshot(), s, `lossless ${g.phase} restore`);
  return h;
};
function finishCounter(g) {
  for (let n = 0; g.phase === 'serving' && n < 100; n++) {
    if (g.awaitingHaggle) g.answerHaggle(true);
    else g.nextCustomer();
  }
  assert.equal(g.phase, 'evening');
}

test('seasons rotate indefinitely and goal rewards are granted once', () => {
  assert.equal(seasonAt(1).name, 'Blossom');
  assert.equal(seasonAt(11).name, 'Suncrest');
  assert.equal(seasonAt(41).year, 2);
  assert.equal(seasonAt(401).year, 11);
  const p = newProgress();
  beginSeason(p, 1);
  p.gathered = 50;
  assert.equal(claimProgress(p).gold, 60);
  assert.equal(claimProgress(p).gold, 0);
  assert.equal(p.stamps, 1);
  beginSeason(p, 11);
  assert.equal(seasonGoals(p)[0].value, 0);
  assert.equal(p.stamps, 1);
  assert.equal(rentDue(30), 974);
  assert.equal(rentDue(5000), rentDue(30));
  const rng = makeRng(21);
  rng();
  const state = rng.state(),
    next = rng();
  rng.restore(state);
  assert.equal(rng(), next);
});

test('day-one market only asks for accessible goods; fresh perishables do not inherit stale ages', () => {
  for (let seed = 1; seed < 40; seed++) {
    const m = dailyMarket(1, makeRng(seed), []),
      available = [...supplyable([]), 'bark', 'berry'];
    assert.ok([...m.hot, m.cold].every((id) => available.includes(id)));
  }
  const inv = { berry: 0 },
    ages = { berry: 2 };
  spoil(inv, ages);
  inv.berry = 2;
  assert.deepEqual(spoil(inv, ages), {});
  assert.equal(ages.berry, 1);
});

test('save preserves forest depletion, position, stamina, RNG and pending haggle', () => {
  const g = create();
  const n = g.map.nodes.find((n) => g.reach[n.y * MAP_W + n.x]);
  g.px = n.x * TILE + 8;
  g.py = n.y * TILE + 8;
  g.checkGather(1);
  assert.equal(n.taken, true);
  const h = clone(g);
  assert.equal(h.rng(), g.rng());
  const before = h.sackCount();
  h.checkGather(0.01);
  assert.equal(h.sackCount(), before);
  h.goHome();
  clone(h);
  h.inv.bark = 8;
  h.inv.resin = 4;
  assert.equal(h.craft('basket', 1000), true);
  assert.equal(h.inv.basket, 4);
  assert.equal(h.progress.made.basket, 4);
  clone(h);
  h.doneCrafting();
  const stock = structuredClone(h.shelf);
  h.doneCrafting();
  assert.deepEqual(h.shelf, stock);
  clone(h);
  h.setPrice('basket', ITEMS.basket.value * 1.2);
  h.openShop();
  h.openShop();
  if (h.phase === 'serving') {
    // A controlled customer isolates the save boundary between deciding and paying.
    clearTimeout(h._customerTimer);
    h.customer = {
      name: 'Test customer',
      wants: 'basket',
      qty: 1,
      wtp: 30,
      face: 0,
    };
    h.shelf.basket = 3;
    h.awaitingHaggle = true;
    h.customerView = { what: 'haggle' };
    const resumed = clone(h),
      gold = resumed.gold;
    resumed.answerHaggle(true);
    assert.equal(resumed.gold, gold + 30);
    resumed.answerHaggle(true);
    assert.equal(resumed.gold, gold + 30);
    const paid = clone(resumed);
    const paidGold = paid.gold;
    paid.nextCustomer();
    assert.ok(paid.gold >= paidGold);
    finishCounter(paid);
    clone(paid);
    clearTimeout(resumed._customerTimer);
    clearTimeout(h._customerTimer);
  }
});

test('old checkpoints migrate and invalid checkpoints never half-restore a shop', () => {
  const g = create();
  const legacy = { ...g.snapshot(), v: 1, gold: 314, inv: { bark: 7 } };
  assert.equal(g.restore(legacy), true);
  assert.equal(g.gold, 314);
  assert.equal(g.inv.bark, 7);
  assert.equal(g.day, 1);
  const before = g.snapshot();
  for (const bad of [
    null,
    {},
    { ...before, day: NaN },
    { ...before, inv: { unknown: 10 } },
    { ...before, map: { ...before.map, tiles: [] } },
    { ...before, progress: null },
  ]) {
    assert.equal(g.restore(bad), false);
    assert.deepEqual(g.snapshot(), before);
  }
});

test('rent is reserved, commissions cannot pay after deadline, and a day cannot advance twice', () => {
  const g = create();
  g.day = 5;
  g.goHome();
  g.doneCrafting();
  g.openShop();
  assert.equal(g.phase, 'evening');
  g.gold = 200;
  assert.equal(g.buyUpgrade('boots'), false);
  g.orders = [
    { id: 'late', from: 'Miller', item: 'pot', qty: 2, pay: 100, due: 4 },
  ];
  g.inv.pot = 2;
  g.settleOrders();
  assert.equal(g.ordersFailed, 1);
  assert.equal(g.inv.pot, 2);
  assert.equal(g.gold, 200);
  g.sleep();
  g.sleep();
  assert.equal(g.day, 6);
  assert.equal(g.gold, 80);
});

test('day 30 retains the shop; guild upgrades unlock recipes and ranked score stays bounded', () => {
  const g = create();
  g.day = 30;
  g.phase = 'evening';
  g.gold = 20000;
  g.takings = 9876;
  g.progress.stamps = 100;
  g.sleep();
  assert.equal(g.phase, 'over');
  assert.equal(g.rankedScore, 9876);
  const h = clone(g);
  assert.equal(h.continueShop(), true);
  assert.equal(h.day, 31);
  assert.equal(h.continueShop(), false);
  h.goHome();
  h.doneCrafting();
  h.openShop();
  finishCounter(h);
  for (let i = 1; i <= 5; i++)
    assert.equal(h.buySpecialisation('artisan'), true);
  assert.equal(h.buySpecialisation('artisan'), false);
  assert.equal(specialisation(h.upgrades, 'artisan').level, 5);
  for (const id of ['chime', 'chest', 'clock'])
    assert.ok(h.recipeBook().includes(id));
  const saved = clone(h);
  saved.takings = 50000;
  let result;
  saved.on('gameover', (r) => (result = r));
  saved.gameOver();
  assert.equal(result.score, 9876);
  assert.equal(result.day, 30);
  assert.equal(result.total, 50000);
});

test('renderer handles phone, landscape and desktop with seasonal state', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    const g = create();
    g.canvas.getBoundingClientRect = () => ({ width, height });
    g.resize();
    g.render();
  }
});

test('commission ingredients stay in the backroom until the crafted order can be filled', () => {
  const g = create();
  g.goHome();
  g.inv = { clay: 2, resin: 1, bark: 4 };
  g.orders = [
    { id: 'pots', from: 'Miller', item: 'pot', qty: 3, pay: 222, due: 4 },
  ];
  g.doneCrafting();
  assert.equal(g.inv.clay, 2);
  assert.equal(g.inv.resin, 1);
  assert.equal(g.shelf.clay, undefined);
  assert.equal(g.shelf.bark, 4);
});

test('budgeted finite-node strategies sustain 120 days across multiple seeds', () => {
  // Economic regression, not a substitute for live walking/hazard playtesting.
  const travelByZone = [0, 6, 13, 21];
  for (let seed = 1; seed <= 8; seed++) {
    const g = create(seed);
    for (let day = 1; day <= 120; day++) {
      let budget = g.stamina,
        deepest = 0;
      const targets = g.orders.map((o) => o.item),
        need = {};
      for (const id of targets)
        for (const [k, v] of Object.entries(RECIPES[id] || { [id]: 1 }))
          need[k] = (need[k] || 0) + v * 3;
      const nodes = g.map.nodes.filter((n) => g.reach[n.y * MAP_W + n.x]);
      const value = (n) =>
        ((need[n.item] || 0) > (g.inv[n.item] || 0) ? 60 : 0) +
        ITEMS[n.item].value +
        (n.item === 'resin' ? 22 : 0);
      nodes.sort((a, b) => value(b) - value(a));
      for (const n of nodes) {
        const travel = Math.max(0, travelByZone[n.zone] - deepest);
        if (budget < 7 + travel) continue;
        budget -= 7 + travel;
        deepest = Math.max(deepest, travelByZone[n.zone]);
        g.px = n.x * TILE + 8;
        g.py = n.y * TILE + 8;
        g.stamina = budget + 5;
        g.checkGather(1);
      }
      g.goHome();
      const recipes = g
        .recipeBook()
        .sort(
          (a, b) =>
            (targets.includes(b) ? 10000 : ITEMS[b].value) -
            (targets.includes(a) ? 10000 : ITEMS[a].value),
        );
      for (const id of recipes) g.craft(id, 1000);
      g.doneCrafting();
      g.openShop();
      finishCounter(g);
      if (g.offer) g.takeOffer(true);
      const reserve = rentDue(Math.ceil(day / 5) * 5);
      for (const id of [
        'axe',
        'masterBench',
        'lantern',
        'shelves',
        'sign',
        'boots',
        'ledger',
      ])
        if (g.gold > reserve + 400) g.buyUpgrade(id);
      for (const id of ['artisan', 'display', 'trail', 'hospitality'])
        if (g.gold > reserve + 1600) g.buySpecialisation(id);
      g.sleep();
      if (g.phase === 'over' && g.won) g.continueShop();
      assert.equal(g.phase, 'forage', `seed ${seed}, day ${day}`);
      assert.ok(g.gold >= 0);
      if (day % 10 === 0) {
        const restored = clone(g);
        clearTimeout(restored._customerTimer);
      }
    }
    assert.equal(g.day, 121);
    assert.ok(
      g.upgrades.includes('artisan3'),
      'advanced recipes are reachable during a continuing career',
    );
  }
});
