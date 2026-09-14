import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  Game,
  validSave,
  wavePlan,
  routePoint,
  routeLength,
} from '../public/dam-defender/js/engine.js';
import {
  MAPS,
  TOWERS,
  PERKS,
  dailyConfig,
  challengeConfig,
  challengeUrl,
} from '../public/dam-defender/js/data.js';
import {
  canvasPoint,
  nearestPad,
  Renderer,
} from '../public/dam-defender/js/render.js';
import worker from '../worker/index.js';
const create = (config = {}) => {
  const g = new Game();
  g.newRun({ seed: 15, ...config });
  return g;
};
const clone = (g) => {
  const s = g.snapshot();
  assert.equal(validSave(s), true, 'valid ' + s.phase + ' checkpoint');
  const h = new Game();
  assert.equal(h.restore(s), true);
  assert.deepEqual(h.snapshot(), s);
  return h;
};

test('daily challenges and friend links preserve the exact setup', () => {
  const c = dailyConfig('2026-09-14');
  assert.deepEqual(c, dailyConfig('2026-09-14'));
  assert.notEqual(c.seed, dailyConfig('2026-09-15').seed);
  assert.deepEqual(challengeConfig('?daily=2026-09-14&seed=12&captain=pip'), c);
  assert.equal(challengeConfig('?daily=2026-02-30'), null);
  for (const map of [0, 1, 2]) {
    const g = create({ map, captain: 'fern' });
    g.state.score = 1234;
    const url = new URL(challengeUrl(g.state, 'https://arcade.test'));
    assert.deepEqual(challengeConfig(url.search), {
      seed: 15,
      map,
      captain: 'fern',
      daily: null,
    });
    assert.equal(url.searchParams.get('challenge'), '1234');
  }
  const g = create({ ...c, seed: 3, captain: 'fern' });
  assert.equal(g.state.captain, 'moss');
  assert.equal(g.state.seed, c.seed);
  assert.equal(challengeConfig('?seed=Infinity&river=0'), null);
  assert.equal(challengeConfig('?seed=4294967296&river=0'), null);
});

test('building, branch upgrades and salvage cannot duplicate wood or stack towers', () => {
  const g = create();
  assert.equal(g.startWave(), false);
  assert.equal(g.build(-1, 'acorn'), false);
  assert.equal(g.build(0, 'unknown'), false);
  assert.equal(g.build(0, 'acorn'), true);
  assert.equal(g.build(0, 'log'), false);
  assert.equal(g.state.wood, 115);
  assert.equal(g.upgrade(0), true);
  const before = g.state.wood;
  assert.equal(g.upgrade(0, 'fake'), false);
  assert.equal(g.state.wood, before);
  g.state.wood = 200;
  assert.equal(g.upgrade(0, 'reach'), true);
  assert.ok(g.stats(g.state.towers[0]).range > TOWERS.acorn.range);
  assert.equal(g.upgrade(0, 'power'), false);
  const spent = g.state.towers[0].spent,
    wood = g.state.wood;
  g.sell(0);
  assert.equal(g.state.wood, wood + Math.floor(spent * 0.7));
  assert.equal(g.sell(0), false);
  g.build(1, 'acorn');
  g.startWave();
  assert.equal(g.build(2, 'acorn'), false);
  assert.equal(g.sell(1), false);
  assert.equal(g.startWave(), false);
});

test('floods hit ground enemies, spare flyers, respect cooldowns and expose a drained dam', () => {
  const g = create();
  g.build(0, 'acorn');
  g.startWave();
  g.state.queue = [];
  g.spawn({ type: 'boar', lane: 0, boss: false });
  g.spawn({ type: 'heron', lane: 0, boss: false });
  const ground = g.state.enemies[0],
    flyer = g.state.enemies[1],
    hp = flyer.hp;
  ground.distance = 200;
  g.state.water = 64;
  assert.equal(g.flood(), true);
  assert.equal(g.state.water, 24);
  assert.ok(ground.distance < 200);
  assert.equal(flyer.hp, hp);
  assert.equal(g.flood(), false);
  // An airborne leak still damages the dam even during a flood.
  ground.hp = 0;
  flyer.distance = routeLength(g.route(flyer)) + 1;
  const dam = g.state.hp;
  g.update(1 / 30);
  assert.equal(g.state.hp, dam - 15);
});

test('saving in battle restores enemies, timers and future outcomes without replaying rewards', () => {
  const g = create({ map: 1 });
  g.build(0, 'acorn');
  g.build(6, 'acorn');
  g.startWave();
  for (let i = 0; i < 120; i++) g.update(1 / 30);
  const h = clone(g);
  g.flood();
  h.flood();
  for (let i = 0; i < 1700; i++) {
    g.update(1 / 30);
    h.update(1 / 30);
  }
  assert.deepEqual(h.snapshot(), g.snapshot());
  g.pause(true);
  const before = g.snapshot();
  g.update(0.3);
  assert.deepEqual(g.snapshot(), before);
  clone(g);
});

test('perks apply once, invalid saves do not alter the running game, and all three bosses spawn', () => {
  const g = create();
  g.state.phase = 'draft';
  g.state.choices = ['deep', 'grove', 'gift'];
  clone(g);
  assert.equal(g.choose('deep'), true);
  assert.equal(g.state.maxWater, 125);
  assert.equal(g.choose('deep'), false);
  const before = g.snapshot();
  for (const bad of [
    null,
    {},
    { ...before, wood: NaN },
    { ...before, map: 8 },
    { ...before, towers: [{ pad: 0, type: 'unknown' }] },
    { ...before, phase: 'draft', choices: [] },
  ]) {
    assert.equal(g.restore(bad), false);
    assert.deepEqual(g.snapshot(), before);
  }
  for (let map = 0; map < 3; map++) {
    const boss = wavePlan(15, map, 12).find((e) => e.boss),
      x = create({ map });
    x.state.wave = 12;
    x.spawn(boss);
    assert.ok(x.state.enemies[0].hp > 0);
    clone(x);
  }
});

test('watermill branches affect income or recharge and captains have distinct bonuses', () => {
  const g = create({ captain: 'pip' });
  assert.equal(g.buildCost('acorn'), 40);
  assert.equal(g.state.hp, 100);
  g.state.wood = 1000;
  g.build(0, 'mill');
  g.upgrade(0);
  g.upgrade(0, 'power');
  g.build(1, 'acorn');
  g.startWave();
  g.state.queue = [];
  const before = g.state.wood;
  g.completeWave();
  assert.equal(g.state.wood - before, 35 + 3 + 20 + 72);
  const h = create();
  h.state.wood = 1000;
  h.build(0, 'mill');
  h.upgrade(0);
  h.upgrade(0, 'reach');
  h.build(1, 'acorn');
  h.startWave();
  h.state.water = 0;
  h.update(0.1);
  assert.ok(h.state.water > 0.18);
});

test('a neglected defence can lose and does not emit the result repeatedly', () => {
  const g = create();
  g.build(11, 'acorn');
  let results = 0;
  g.on('gameover', () => results++);
  for (let wave = 1; wave <= 5 && g.state.phase !== 'over'; wave++) {
    g.startWave();
    for (let i = 0; i < 6000 && g.state.phase === 'battle'; i++)
      g.update(1 / 30);
    if (g.state.phase === 'draft') g.choose(g.state.choices[0]);
  }
  assert.equal(g.state.phase, 'over');
  assert.equal(results, 1);
  g.update(0.3);
  g.finish(false);
  assert.equal(results, 1);
  clone(g);
});

function playCampaign(map, seed) {
  const g = create({ map, seed }),
    s = g.state;
  const cover = (pad, type) => {
    const [x, y] = MAPS[map].pads[pad];
    let n = 0;
    for (const route of MAPS[map].paths)
      for (let d = 0; d < 1300; d += 15) {
        const p = routePoint(route, d);
        if (p.done) break;
        if (Math.hypot(x - p.x, y - p.y) < TOWERS[type].range) n++;
      }
    return n;
  };
  for (let wave = 1; wave <= 12; wave++) {
    if (s.hp < s.maxHp - 25) g.repair();
    for (let tries = 0; tries < 30; tries++) {
      const options = [];
      for (let pad = 0; pad < 12; pad++) {
        const t = s.towers.find((t) => t.pad === pad);
        if (t) {
          if (t.level < 3 && g.upgradeCost(t) <= s.wood)
            options.push({
              pad,
              upgrade: true,
              value:
                (cover(pad, t.type) * (0.65 + (t.level === 2 ? 0.4 : 0))) /
                g.upgradeCost(t),
            });
        } else
          for (const type of ['acorn', 'log', 'watch', 'bramble'])
            if (g.buildCost(type) <= s.wood) {
              let value =
                (cover(pad, type) * TOWERS[type].damage) /
                TOWERS[type].rate /
                g.buildCost(type) /
                15;
              if (type === 'bramble')
                value *= s.towers.some((t) => t.type === 'bramble') ? 0.4 : 5;
              if (type === 'log') value *= 1.6;
              if (type === 'watch') value *= 1.3;
              options.push({ pad, type, value });
            }
      }
      options.sort((a, b) => b.value - a.value);
      const o = options[0];
      if (!o) break;
      if (o.upgrade) g.upgrade(o.pad, 'power');
      else g.build(o.pad, o.type);
    }
    g.startWave();
    let n = 0;
    while (s.phase === 'battle' && n++ < 9000) {
      if (
        s.enemies.filter((e) => !e.flying && e.hp > 0).length >= 5 &&
        s.water >= 65
      )
        g.flood();
      g.update(1 / 30);
    }
    assert.notEqual(s.phase, 'battle', 'wave must resolve');
    assert.notEqual(
      s.phase,
      'over',
      `balanced strategy: river ${map}, wave ${wave}`,
    );
    clone(g);
    if (s.phase === 'draft') {
      const priority = [
        'sharp',
        'quick',
        'torrent',
        'long',
        'grove',
        'salvage',
        'gift',
        'deep',
        'millwright',
      ];
      g.choose(
        [...s.choices].sort(
          (a, b) => priority.indexOf(a) - priority.indexOf(b),
        )[0],
      );
    }
  }
  return g;
}

test('complete seeded campaigns are winnable on all rivers and transition safely to endless mode', () => {
  for (let map = 0; map < 3; map++)
    for (const seed of [1, 2, 3]) {
      const g = playCampaign(map, seed);
      assert.equal(g.state.phase, 'victory');
      assert.equal(g.state.wave, 12);
      assert.ok(g.state.score > 1000);
      const h = clone(g);
      assert.equal(h.continueEndless(), true);
      assert.equal(h.continueEndless(), false);
      assert.equal(h.state.phase, 'build');
      h.startWave();
      assert.equal(h.state.wave, 13);
      assert.ok(validSave(h.snapshot()));
    }
});

test('pointer mapping and renderer work at phone and desktop sizes without non-finite drawing', () => {
  const ctx = new Proxy(
    { measureText: (t) => ({ width: String(t).length * 8 }) },
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
  globalThis.document = { createElement: () => ({ getContext: () => ctx }) };
  for (const width of [320, 390, 768, 1280]) {
    const rect = { left: 12, top: 30, width, height: (width * 600) / 960 },
      [x, y] = MAPS[0].pads[0];
    const p = canvasPoint(
      rect,
      12 + (x / 960) * width,
      30 + (y / 600) * rect.height,
    );
    assert.equal(nearestPad(0, p), 0);
  }
  const r = new Renderer({ getContext: () => ctx });
  for (let map = 0; map < 3; map++) {
    const g = create({ map });
    g.build(0, 'acorn');
    g.startWave();
    g.update(0.3);
    r.draw(g, 0, 1);
    g.flood();
    r.draw(g, 2, 2, false, 'log');
  }
});

test('the new game is accepted by the score API and all offline dependencies exist', async () => {
  const response = await worker.fetch(
    new Request('https://arcade.test/api/scores', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'dam-test-123456',
        game: 'dam-defender',
        score: 1234,
        wave: 12,
        difficulty: 'veteran',
        name: 'BEAVER',
      }),
    }),
    { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) } },
  );
  assert.equal(response.status, 200);
  const sw = readFileSync('public/dam-defender/sw.js', 'utf8');
  const assets = sw.slice(
    sw.indexOf('const ASSETS'),
    sw.indexOf('];', sw.indexOf('const ASSETS')),
  );
  for (const [, asset] of assets.matchAll(/'([^']+)'/g))
    assert.ok(
      existsSync(
        asset.startsWith('/')
          ? 'public' + asset
          : 'public/dam-defender/' + asset,
      ),
      asset,
    );
  for (const module of ['engine', 'data', 'render', 'audio', 'main'])
    assert.ok(assets.includes(`js/${module}.js`));
});
