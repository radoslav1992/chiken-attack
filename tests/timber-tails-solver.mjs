/*
 * Reachability for Timber Tails stages, using the game's own physics.
 *
 * From every place the beaver can stand, a few hundred short input scripts are
 * played through the real engine (run-up, jump height, how long the direction
 * is held, drop-throughs, mushroom bounces). Wherever a script lands is a new
 * place to stand. The search ends when nothing new turns up.
 *
 * Two things make a pass mean "comfortable" rather than "possible on paper":
 * the engine runs with a handicap (8% slower, slightly lower jump), and thorns
 * count as walls — a route that needs a hit taken is not a route.
 *
 * Moving things are flattened: a raft or lift is treated as standable anywhere
 * along its path, since it gets there eventually and the player can wait.
 * Creatures are left out; they are a matter of timing, not of geometry.
 */

import { Game, T, AIR, BRANCH, SHROOM, ICE } from '../public/timber-tails/js/engine.js';

const HANDICAP = 0.92;

function flatten(level) {
  const tiles = Uint8Array.from(level.tiles);
  for (const e of level.ents) {
    if (e.t !== 'mover') continue;
    if (e.axis === 'x') {
      for (let c = e.x; c <= e.x + 2 + e.range; c++)
        if (tiles[e.y * level.w + c] === AIR) tiles[e.y * level.w + c] = BRANCH;
    } else {
      for (let r = e.y + e.range; r <= e.y; r++)
        for (let c = e.x; c <= e.x + 2; c++)
          if (tiles[r * level.w + c] === AIR) tiles[r * level.w + c] = BRANCH;
    }
  }
  return { ...level, tiles, ents: [] };
}

const SCRIPTS = [];
for (const dir of [-1, 1]) {
  for (const run of [0, 10, 22, 46])
    for (const hold of [3, 9, 30])
      for (const keep of [0, 6, 14, 26, 999]) SCRIPTS.push({ dir, run, hold, keep });
  for (const walk of [8, 20, 44]) SCRIPTS.push({ dir, run: walk, hold: 0, keep: 0 });
}
SCRIPTS.push({ dir: 0, run: 0, hold: 30, keep: 0 }, { dir: 0, run: 0, hold: 8, keep: 0 });
for (const dir of [-1, 0, 1]) SCRIPTS.push({ dir, run: 0, hold: 0, keep: 999, drop: true });

const AIR_PLANS = [];
for (const dir of [-1, 0, 1]) for (const keep of [6, 14, 22, 32, 999]) AIR_PLANS.push({ dir, keep });

export function solve(level) {
  const flat = flatten(level);
  const g = new Game(flat, { solver: true, handicap: HANDICAP });
  g.bossDead = true;
  const fresh = { ...g.p };
  const w = level.w;
  const seen = new Set();
  const queue = [];
  const seenAir = new Set();
  const airQueue = [];
  let logs = 0;
  let goal = false;
  const checks = new Set();

  const reset = (state) => {
    g.tiles.set(flat.tiles);
    g.state = 'play';
    g.events.length = 0;
    g.ents.length = 0;
    g.logs = 0;
    g.checkpoint = null;
    Object.assign(g.p, fresh, state);
  };
  const inp = {
    left: false,
    right: false,
    jump: false,
    down: false,
    action: false,
    jumpPressed: false,
    downPressed: false,
    actionPressed: false,
  };
  const stand = () => {
    const p = g.p;
    const c = Math.floor((p.x + p.w / 2) / T),
      r = Math.floor((p.y + p.h + 1) / T);
    const key = r * w + c;
    if (!seen.has(key)) {
      seen.add(key);
      queue.push(key);
    }
  };
  /** Returns false when the attempt should be thrown away. */
  const after = () => {
    const p = g.p;
    if (p.dead || p.hearts < 3) return false;
    logs |= g.logs;
    if (g.checkpoint) checks.add(g.checkpoint.x);
    if (g.state === 'clear') {
      goal = true;
      return false;
    }
    if (p.bounced) {
      p.bounced = false;
      const key = `${Math.round(p.x / 3)},${Math.round(p.y / 8)}`;
      if (!seenAir.has(key)) {
        seenAir.add(key);
        airQueue.push({ ...p });
      }
      return false;
    }
    if (p.onGround) stand();
    return true;
  };

  /* settle the spawn */
  reset({});
  for (let f = 0; f < 60; f++) {
    g.step(inp);
    if (!after()) break;
  }

  while (queue.length || airQueue.length) {
    while (queue.length) {
      const key = queue.pop();
      const c = key % w,
        r = Math.floor(key / w);
      const icy = flat.tiles[key] === ICE;
      for (const s of SCRIPTS) {
        if (s.run === 46 && !icy) continue;
        for (const off of s.dir === 0 ? [0] : [0, s.dir * 6, -s.dir * 6]) {
          const x = c * T + 3 + off,
            y = r * T - 14;
          if (g.solid(Math.floor(x / T), Math.floor(y / T)) || g.solid(Math.floor((x + 9.99) / T), Math.floor(y / T)))
            continue;
          reset({ x, y, onGround: true, coyote: 6, ground: flat.tiles[key] });
          const jumpAt = s.drop ? 1 : s.run;
          const end = s.hold ? jumpAt + 150 : s.drop ? 90 : s.run + 30;
          for (let f = 0; f < end; f++) {
            const moving = f < jumpAt + (s.hold || s.drop ? s.keep : 0) || (!s.hold && !s.drop && f < s.run);
            inp.left = moving && s.dir < 0;
            inp.right = moving && s.dir > 0;
            inp.down = !!s.drop && f < 4;
            inp.jumpPressed = (s.hold > 0 || s.drop) && f === jumpAt;
            inp.jump = s.hold > 0 && f >= jumpAt && f < jumpAt + s.hold;
            g.step(inp);
            if (!after()) break;
            if (f > jumpAt + 2 && g.p.onGround && (s.hold || s.drop) && !moving) break;
          }
        }
      }
    }
    while (airQueue.length) {
      const snap = airQueue.pop();
      for (const plan of AIR_PLANS) {
        reset(snap);
        inp.down = inp.jump = inp.jumpPressed = false;
        for (let f = 0; f < 200; f++) {
          inp.left = plan.dir < 0 && f < plan.keep;
          inp.right = plan.dir > 0 && f < plan.keep;
          g.step(inp);
          if (!after()) break;
          if (g.p.onGround) break;
        }
      }
    }
  }
  return { goal, logs, checks, standable: seen };
}

/** For debugging a stage that fails: the furthest column the search reached. */
export function furthest(result, level) {
  let max = 0;
  for (const key of result.standable) max = Math.max(max, key % level.w);
  return max;
}
export { SHROOM };

/**
 * A deliberately simple player for the boar: trail him to the wall, land on him
 * while he is dazed, hop his charges and the ripples. If this can win, a person
 * can. Returns { win, hearts }.
 */
export function fightBoss(level) {
  const g = new Game(level, {});
  const a = level.arena;
  g.p.x = (a.x0 + 2) * T;
  g.p.y = (level.h - 2) * T - g.p.h;
  let prevJump = false;
  for (let f = 0; f < 60 * 120; f++) {
    const p = g.p,
      b = g.boss;
    const inp = { left: false, right: false, jump: false, down: false, action: false, jumpPressed: false, downPressed: false, actionPressed: false };
    if (b && !p.dead) {
      const pcx = p.x + 5,
        dx = b.x + 14 - pcx,
        dist = Math.abs(dx);
      let jump = false;
      if (b.state === 'stun') {
        if (dist > 6) dx > 0 ? (inp.right = true) : (inp.left = true);
        if (dist < 40 && p.onGround) jump = true;
        if (!p.onGround) jump = p.vy < 0;
      } else if (b.state === 'charge') {
        const coming = Math.sign(b.vx || b.face) === Math.sign(-dx);
        if (coming && dist < 44 + b.speed * 8 && p.onGround) jump = true;
        if (!p.onGround) jump = true;
        else if (!coming && dist > 46) dx > 0 ? (inp.right = true) : (inp.left = true);
      } else if (b.state === 'leap') {
        const land = b.x + b.vx * Math.max(0, 43 - b.t) + 14;
        if (Math.abs(land - pcx) < 50) {
          const roomLeft = pcx - a.x0 * T > 30,
            roomRight = a.x1 * T - pcx > 30;
          if (land > pcx) roomLeft ? (inp.left = true) : (inp.right = true);
          else roomRight ? (inp.right = true) : (inp.left = true);
        }
      } else if (dist < 70) {
        if (dx > 0 && pcx - a.x0 * T > 40) inp.left = true;
        if (dx <= 0 && a.x1 * T - pcx > 40) inp.right = true;
      }
      for (const e of g.ents) {
        if (e.type !== 'ripple' || e.dead) continue;
        const d = e.x + 5 - pcx;
        if (Math.abs(d) < 26 && Math.sign(e.vx) === Math.sign(-d) && p.onGround) jump = true;
        if (Math.abs(d) < 40 && !p.onGround) jump = true;
      }
      inp.jump = jump;
      inp.jumpPressed = jump && !prevJump;
      prevJump = jump;
    }
    g.step(inp);
    if (g.bossDead) return { win: true, hearts: g.p.hearts, score: g.score };
    if (g.state === 'dead') return { win: false };
  }
  return { win: false };
}
