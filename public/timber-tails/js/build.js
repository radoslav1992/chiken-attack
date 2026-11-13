/*
 * Timber Tails — turns a stage drawn as text into the grid the engine runs.
 *
 * A stage is a list of segments laid left to right. Each segment is a block of
 * equal-length rows; its bottom row is the floor line and is repeated once
 * underneath, so ground is two tiles thick and a gap is a real pit.
 *
 * A "|" is a ruler for whoever is drawing and is ignored.
 *
 *   .  air                 #  ground             =  stone
 *   B  crate (breakable)   -  branch (one-way)   %  crumbling log
 *   ?  stash: one acorn    A  stash: five acorns M  bounce mushroom
 *   h  stash: berry        c  stash: pinecones   g  stash: golden acorn
 *   l  stash: clover (1up) I  ice                ~  water / embers (deadly)
 *   ^  thorns              o  acorn              +  berry
 *   L  golden log (hidden, one or two a stage)   P  checkpoint
 *   D  lodge door (goal)   @  start
 *   s snail  b beetle  H hedgehog  f frog  w wasp  v bat  p pike
 *   i icicle  y geyser  X saw (sideways)  x saw (up and down)
 *   >  log raft: three wide, drifts right to the far bank and back
 *   u  lift: three wide, rises five tiles and returns
 *   Z  the boar           G  arena gate (shuts behind you)
 */

import {
  AIR,
  GROUND,
  STONE,
  CRATE,
  STASH,
  BRANCH,
  THORN,
  SHROOM,
  ICE,
  WATER,
  CRUMBLE,
  ACORN,
  LOG,
  BERRY,
  CHECK,
  GOAL,
} from './engine.js';

const TILE_OF = {
  '#': GROUND,
  '=': STONE,
  B: CRATE,
  '-': BRANCH,
  '%': CRUMBLE,
  M: SHROOM,
  I: ICE,
  '~': WATER,
  '^': THORN,
  o: ACORN,
  '+': BERRY,
  L: LOG,
  P: CHECK,
  D: GOAL,
};
const STASH_OF = { '?': ['a', 1], A: ['a', 5], h: ['h', 1], c: ['c', 1], g: ['g', 1], l: ['l', 1] };
const ENEMY_OF = {
  s: 'snail',
  b: 'beetle',
  H: 'hog',
  f: 'frog',
  w: 'wasp',
  v: 'bat',
  p: 'pike',
  i: 'icicle',
  y: 'geyser',
};
const FILL_DOWN = new Set(['#', '=', 'I', '~']);

const LIQUID = new Set(['marsh', 'ember', 'mill']);

export const ROWS = 15;

/** The closing boss room, the same shape in every fourth stage. */
export const ARENA = `
==......................==
==......................==
==......................==
==......................==
==......................==
==......................==
==......................==
GG......................==
GG......................==
GG...........Z.......D..==
##########################`;

export function buildLevel(def, index) {
  const segs = def.segs.map((text, n) => {
    const rows = text
      .split('\n')
      .map((line) => line.replace(/\|/g, ''))
      .filter((line) => line.length > 0);
    const width = rows[0].length;
    rows.forEach((row, j) => {
      if (row.length !== width)
        throw new Error(`${def.id} segment ${n} row ${j}: ${row.length} wide, expected ${width}`);
    });
    if (rows.length > ROWS - 1) throw new Error(`${def.id} segment ${n}: too tall`);
    return rows;
  });
  const w = segs.reduce((sum, rows) => sum + rows[0].length, 0);
  const h = ROWS;
  const tiles = new Uint8Array(w * h);
  const stash = [];
  const logs = [];
  const ents = [];
  let spawn = null;
  let arena = null;
  const gate = [];
  const world = Math.floor(index / 4) + 1;

  let x0 = 0;
  for (const rows of segs) {
    const width = rows[0].length;
    const top = h - 1 - rows.length;
    for (let j = 0; j < rows.length; j++) {
      const r = top + j;
      for (let i = 0; i < width; i++) {
        const ch = rows[j][i];
        const c = x0 + i;
        const idx = r * w + c;
        if (ch === '.') continue;
        if (TILE_OF[ch] !== undefined) {
          tiles[idx] = TILE_OF[ch];
          if (ch === 'L') logs.push(idx);
        } else if (STASH_OF[ch]) {
          tiles[idx] = STASH;
          stash.push([idx, { item: STASH_OF[ch][0], n: STASH_OF[ch][1] }]);
        } else if (ENEMY_OF[ch]) {
          ents.push({ t: ENEMY_OF[ch], x: c, y: r, hang: ch === 'v' || ch === 'i' });
          if (ch === 'p') tiles[idx] = WATER;
        } else if (ch === 'X' || ch === 'x') {
          ents.push({ t: 'saw', x: c, y: r, axis: ch === 'X' ? 'x' : 'y', range: ch === 'X' ? 3 : 2.5 });
        } else if (ch === '>') {
          let range = 0;
          while (range < 14 && i + 3 + range < width && '.p'.includes(rows[j][i + 3 + range])) range++;
          ents.push({ t: 'mover', x: c, y: r, axis: 'x', range });
        } else if (ch === 'u') {
          ents.push({ t: 'mover', x: c, y: r, axis: 'y', range: -5 });
        } else if (ch === '@') {
          spawn = { x: c, y: r };
        } else if (ch === 'Z') {
          ents.push({ t: 'boar', x: c, y: r, hp: 3 + Math.floor(world / 3) + (world === 8 ? 1 : 0), world });
        } else if (ch === 'G') {
          gate.push(idx);
        } else {
          throw new Error(`${def.id}: unknown tile "${ch}"`);
        }
        if (j === rows.length - 1 && (FILL_DOWN.has(ch) || ch === 'p'))
          tiles[(r + 1) * w + c] = ch === 'p' ? WATER : TILE_OF[ch];
        /* A ceiling drawn on the top row is solid rock all the way up. */
        if (j === 0 && (ch === '#' || ch === '='))
          for (let up = r - 1; up >= 0; up--) tiles[up * w + c] = TILE_OF[ch];
      }
    }
    /* Marsh, ember and mill pits are never empty: something waits at the bottom. */
    if (LIQUID.has(def.theme))
      for (let i = 0; i < width; i++)
        if (tiles[(h - 1) * w + x0 + i] === AIR) tiles[(h - 1) * w + x0 + i] = WATER;
    if (gate.length && !arena) arena = { x0: x0 + 2, x1: x0 + width - 2, gate };
    x0 += width;
  }
  /* Bats and icicles hang from whatever is above them, however it was drawn. */
  for (const e of ents) {
    if (!e.hang) continue;
    while (e.y > 0 && tiles[(e.y - 1) * w + e.x] === AIR) e.y--;
  }
  if (!spawn) {
    let r = 0;
    while (r < h && tiles[r * w + 2] === AIR) r++;
    spawn = { x: 2, y: r - 1 };
  }
  return {
    id: def.id,
    index,
    world,
    stage: (index % 4) + 1,
    name: def.name,
    theme: def.theme,
    time: def.time || 240,
    w,
    h,
    tiles,
    stash,
    logs,
    ents,
    spawn,
    arena,
  };
}
