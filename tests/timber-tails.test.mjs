import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  Game,
  NO_INPUT,
  T,
  AIR,
  USED,
  STASH,
  CRATE,
  GOAL,
  CHECK,
} from '../public/timber-tails/js/engine.js';
import { buildLevel } from '../public/timber-tails/js/build.js';
import { LEVELS, WORLDS } from '../public/timber-tails/js/levels.js';
import { solve, fightBoss } from './timber-tails-solver.mjs';
import { GAMES } from '../src/data/games.js';

const key = (over = {}) => ({ ...NO_INPUT, ...over });
const make = (rows, opts) => new Game(buildLevel({ id: 't', name: 't', theme: 'meadow', segs: [rows] }, 0), opts);
const run = (g, frames, inp = NO_INPUT) => {
  for (let i = 0; i < frames; i++) g.step(typeof inp === 'function' ? inp(i) : inp);
};
const has = (g, type) => g.events.some((e) => e.type === type);

/* ------------------------------------------------------------- the stages -- */

test('there are eight worlds of four stages, and every fourth is a boss room', () => {
  assert.equal(WORLDS.length, 8);
  assert.equal(LEVELS.length, 32);
  LEVELS.forEach((level, i) => {
    assert.equal(level.id, `${Math.floor(i / 4) + 1}-${(i % 4) + 1}`);
    assert.equal(level.theme, WORLDS[level.world - 1].theme);
    assert.equal(level.h, 15);
    assert.equal(level.tiles.filter((t) => t === GOAL).length, 1, `${level.id} needs exactly one door`);
    assert.ok(level.tiles.includes(CHECK), `${level.id} needs a checkpoint`);
    assert.ok(level.logs.length >= 1, `${level.id} hides at least one golden log`);
    const boss = level.ents.filter((e) => e.t === 'boar');
    if (level.stage === 4) {
      assert.ok(level.arena, `${level.id} needs an arena`);
      assert.equal(boss.length, 1);
      assert.ok(boss[0].hp >= 3 && boss[0].hp <= 6);
    } else {
      assert.equal(level.arena, null);
      assert.equal(boss.length, 0);
      assert.ok(level.w >= 150, `${level.id} is too short`);
    }
  });
  assert.deepEqual(new Set(LEVELS.map((l) => l.name)).size, 32, 'stage names are unique');
});

test('every stage can be finished, and every log and checkpoint reached, on handicapped physics', () => {
  for (const level of LEVELS) {
    const r = solve(level);
    assert.ok(r.goal, `${level.id} ${level.name}: the door is out of reach`);
    assert.equal(r.logs, (1 << level.logs.length) - 1, `${level.id} ${level.name}: a golden log is out of reach`);
    level.tiles.forEach((t, idx) => {
      if (t === CHECK) assert.ok(r.checks.has(idx % level.w), `${level.id}: checkpoint at column ${idx % level.w} is out of reach`);
    });
  }
});

test('the solver is not a rubber stamp: a pit too wide or a wall too tall fails', () => {
  const pit = buildLevel({ id: 'x', name: 'x', theme: 'meadow', segs: ['.@.............D.\n####.......######'] }, 0);
  assert.equal(solve(pit).goal, false);
  const wall = buildLevel(
    { id: 'x', name: 'x', theme: 'meadow', segs: ['......=......\n......=......\n......=......\n......=......\n......=......\n.@....=...D..\n#############'] },
    0,
  );
  assert.equal(solve(wall).goal, false);
  const fine = buildLevel({ id: 'x', name: 'x', theme: 'meadow', segs: ['.@.........D.\n####...######'] }, 0);
  assert.equal(solve(fine).goal, true);
  const thorns = buildLevel({ id: 'x', name: 'x', theme: 'meadow', segs: ['.@..^^^^^^^^..D.\n################'] }, 0);
  assert.equal(solve(thorns).goal, false, 'a route through thorns is not a route');
});

test('Bristle can be beaten in every world by a player who only knows the one trick', () => {
  for (const level of LEVELS.filter((l) => l.arena)) {
    const r = fightBoss(level);
    assert.ok(r.win, `${level.id}: the simple player lost`);
    assert.ok(r.score >= 5000);
  }
});

/* ------------------------------------------------------------- the engine -- */

test('landing on a snail defeats it; landing on a hedgehog hurts; a tail-slam beats the hedgehog', () => {
  let g = make('.@.\n...\n...\n.s.\n###');
  g.ents[0].vx = 0;
  run(g, 40);
  assert.ok(g.ents.every((e) => e.dead) && has(g, 'stomp'));
  assert.equal(g.p.hearts, 3);
  assert.equal(g.score, 100);

  g = make('.@.\n...\n...\n.H.\n###');
  g.ents[0].vx = 0;
  run(g, 40);
  assert.equal(g.p.hearts, 2);
  assert.ok(!g.ents[0].dead);

  g = make('.@.\n...\n...\n...\n.H.\n###');
  g.ents[0].vx = 0;
  run(g, 3);
  g.step(key({ down: true, downPressed: true }));
  run(g, 40);
  assert.ok(g.ents[0].dead, 'slam should flatten the hedgehog');
  assert.equal(g.p.hearts, 3);
});

test('a walking enemy hurts on contact, then mercy frames hold', () => {
  const g = make('....\n.@b.\n####');
  run(g, 30);
  assert.equal(g.p.hearts, 2);
  run(g, 40);
  assert.equal(g.p.hearts, 2);
});

test('stashes pay out once, five-acorn stashes five times, crates break', () => {
  const g = make('.?.\n...\n...\n.@.\n###');
  const jump = (i) => key({ jump: i < 20, jumpPressed: i === 0 });
  run(g, 50, jump);
  assert.equal(g.acorns, 1);
  assert.ok(g.tiles.includes(USED) && !g.tiles.includes(STASH));
  run(g, 50, jump);
  assert.equal(g.acorns, 1, 'a spent stash stays spent');

  const five = make('.A.\n...\n...\n.@.\n###');
  for (let n = 0; n < 7; n++) run(five, 50, jump);
  assert.equal(five.acorns, 5);

  const crate = make('.B.\n...\n...\n.@.\n###');
  run(crate, 50, jump);
  assert.ok(!crate.tiles.includes(CRATE));
});

test('berries heal, pinecones arm the throw and are lost on a hit', () => {
  const g = make('.h.c.\n.....\n.....\n.@...\n#####', { hearts: 1 });
  const jump = (i) => key({ jump: i < 20, jumpPressed: i === 0 });
  run(g, 60, jump);
  const berry = g.ents.find((e) => e.type === 'item' && e.kind === 'h');
  assert.ok(berry, 'a berry should have sprouted');
  g.p.x = berry.x;
  g.p.y = berry.y;
  g.step(NO_INPUT);
  assert.equal(g.p.hearts, 2);

  g.popStash(3, g.h - 6);
  const cones = g.ents.find((e) => e.type === 'item' && e.kind === 'c');
  run(g, 20);
  g.p.x = cones.x;
  g.p.y = cones.y;
  g.step(NO_INPUT);
  assert.equal(g.p.cones, true);
  g.step(key({ action: true, actionPressed: true }));
  assert.ok(g.ents.some((e) => e.type === 'cone'));
  g.hurt();
  assert.equal(g.p.cones, false);
});

test('a hundred acorns is a life', () => {
  const g = make('.@.\n###', { acorns: 99, lives: 3 });
  g.addAcorn(0, 0);
  assert.equal(g.lives, 4);
});

test('thorns hurt, water and pits end the attempt, and the clock runs out', () => {
  let g = make('....\n.@^.\n####');
  run(g, 40, key({ right: true }));
  assert.equal(g.p.hearts, 2);

  g = make('.@...\n##~##');
  run(g, 200, key({ right: true }));
  assert.equal(g.state, 'dead');

  g = make('.@...\n##.##');
  run(g, 300, key({ right: true }));
  assert.equal(g.state, 'dead');

  g = make('.@.\n###');
  g.timeLeft = 3;
  run(g, 200);
  assert.equal(g.state, 'dead');
});

test('a checkpoint and collected logs survive into the next attempt', () => {
  const level = buildLevel({ id: 't', name: 't', theme: 'meadow', segs: ['.@.L.P....D.\n############'] }, 0);
  const g = new Game(level);
  run(g, 120, key({ right: true }));
  assert.equal(g.logs, 1);
  assert.ok(g.checkpoint);
  const again = new Game(level, { logs: g.logs, checkpoint: g.checkpoint });
  assert.equal(again.p.x, g.checkpoint.x * T + 3);
  assert.ok(!again.tiles.includes(13), 'the log already taken is gone');
  run(again, 200, key({ right: true }));
  assert.equal(again.state, 'clear');
});

test('the lodge door stays shut until the boar is down, and the gate shuts behind you', () => {
  const level = LEVELS[3];
  const g = new Game(level);
  const a = level.arena;
  const door = level.tiles.indexOf(GOAL);
  g.p.x = (door % level.w) * T;
  g.p.y = (level.h - 2) * T - g.p.h;
  g.p.inv = 1e6;
  run(g, 30);
  assert.equal(g.state, 'play', 'door must be locked while the boar lives');
  assert.ok(g.bossActive);
  for (const idx of a.gate) assert.notEqual(g.tiles[idx], AIR);
  g.boss.hp = 1;
  g.boss.state = 'stun';
  g.boss.t = 0;
  g.p.x = g.boss.x + 9;
  g.p.y = g.boss.y - 30;
  g.p.vy = 1;
  run(g, 200);
  assert.ok(g.bossDead);
  g.p.x = (door % level.w) * T;
  run(g, 10);
  assert.equal(g.state, 'clear');
});

test('rafts carry the player and mushrooms throw them', () => {
  const raft = make('.@........\n#>.......#');
  run(raft, 30);
  const x0 = raft.p.x;
  assert.ok(raft.p.ride, 'standing on the raft');
  run(raft, 120);
  assert.ok(raft.p.x > x0 + 40, 'the raft moved the player');
  assert.ok(raft.p.onGround);

  const shroom = make('...\n...\n...\n...\n...\n...\n...\n.@.\n.M.\n###');
  run(shroom, 12);
  assert.ok(has(shroom, 'boing'));
  let top = shroom.p.y;
  for (let i = 0; i < 40; i++) {
    shroom.step(NO_INPUT);
    top = Math.min(top, shroom.p.y);
  }
  assert.ok((shroom.h - 3) * T - (top + shroom.p.h) > 6 * T, 'a bounce clears six tiles');
});

/* --------------------------------------------------------------- the site -- */

test('Timber Tails is in the arcade and its offline cache lists real files', () => {
  const entry = GAMES.find((g) => g.slug === 'timber-tails');
  assert.ok(entry && entry.playable);
  for (const path of [entry.art, entry.stageArt, entry.icon]) assert.ok(existsSync(`public${path}`), path);
  const sw = readFileSync('public/timber-tails/sw.js', 'utf8');
  const assets = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];', sw.indexOf('const ASSETS')));
  const listed = [...assets.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const asset of listed)
    assert.ok(existsSync(asset.startsWith('/') ? `public${asset}` : `public/timber-tails/${asset}`), asset);
  for (const file of ['engine', 'build', 'levels', 'render', 'sprites', 'audio', 'main'])
    assert.ok(listed.includes(`js/${file}.js`), `${file}.js must be cached for offline play`);
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /\/timber-tails\/sw\.js\n\s+Cache-Control: no-cache/);
});
