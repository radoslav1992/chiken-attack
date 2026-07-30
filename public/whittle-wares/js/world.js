/*
 * Whittle & Wares — the wood.
 *
 * A fresh map every morning, generated from the day's seed. Pure module: no
 * browser API, so ww-world.mjs can generate a few thousand maps in Node and
 * check the one property that matters.
 *
 * THE PROPERTY: every resource node must be reachable on foot from the shop
 * door. A generator that scatters trees at random will eventually wall a node
 * off behind them, and the player's experience of that is not "an unlucky map",
 * it is "I walked all the way up there and the game was broken". So the path is
 * carved FIRST and obstacles are placed around it, and then the result is
 * flood-filled and any node that ended up stranded is moved. Verified by
 * generating every map the game can generate and asserting nothing is orphaned.
 *
 * The map is a tall strip: the shop door at the bottom, the wood running north.
 * Deeper is further, which is what makes `travel` in economy.js a real cost
 * rather than a number in a table — the stamina goes on walking.
 */

import { ZONES, NODE_COST } from './economy.js';

export const TILE = 16;
export const MAP_W = 30;
export const MAP_H = 160;

/* Tile codes. Anything >= SOLID_FROM blocks, except the gates, which block
 * conditionally — that is the whole progression, expressed as two tiles. */
export const T = {
  grass: 0,
  path: 1,
  flower: 2,
  door: 3,
  tree: 4,
  rock: 5,
  water: 6,
  stump: 7,
  gateAxe: 8, // brambles: cut with the Steel Axe
  gateLantern: 9, // a dark cleft: needs the Lantern
};

const SOLID_FROM = T.tree;

export function solid(code, upgrades) {
  if (code === T.gateAxe) return !upgrades.includes('axe');
  if (code === T.gateLantern) return !upgrades.includes('lantern');
  return code >= SOLID_FROM;
}

/** Which band a tile row belongs to. Row 0 is the deepest. */
export function bandOfRow(row) {
  const per = MAP_H / ZONES.length;
  return ZONES.length - 1 - Math.floor(row / per);
}

/** The row range of a band, deepest band at the top of the map. */
export function bandRows(zoneId) {
  const per = MAP_H / ZONES.length;
  const top = (ZONES.length - 1 - zoneId) * per;
  return [top, top + per - 1];
}

const idx = (x, y) => y * MAP_W + x;

/* --- generation ----------------------------------------------------------- */

export function generate(day, upgrades, rng) {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(T.grass);

  /* 1. Carve the trail first. A single wandering column from the door to the
   *    top of the map, three tiles wide, so nothing generated later can sever
   *    the wood from the shop. */
  let cx = MAP_W >> 1;
  const spine = new Int16Array(MAP_H);
  for (let y = MAP_H - 1; y >= 0; y--) {
    spine[y] = cx;
    for (let d = -1; d <= 1; d++) {
      const x = clampX(cx + d);
      tiles[idx(x, y)] = T.path;
    }
    if (rng() < 0.34) cx = clampX(cx + (rng() < 0.5 ? -1 : 1) * rng.int(1, 2));
  }

  /* 2. Side clearings, so the map is not one corridor. Each is a blob hung off
   *    the trail, and being carved from the trail they inherit its reachability. */
  const clearings = [];
  for (let y = 4; y < MAP_H - 6; y += rng.int(5, 9)) {
    const side = rng() < 0.5 ? -1 : 1;
    const w = rng.int(3, 6);
    const h = rng.int(3, 5);
    const x0 = clampX(spine[y] + side * 2);
    const cxr = clampX(x0 + side * w);
    for (let yy = y; yy < Math.min(MAP_H - 2, y + h); yy++) {
      const a = Math.min(x0, cxr);
      const b = Math.max(x0, cxr);
      for (let xx = a; xx <= b; xx++) tiles[idx(xx, yy)] = T.path;
    }
    clearings.push({ x: (Math.min(x0, cxr) + Math.max(x0, cxr)) >> 1, y: y + (h >> 1) });
  }

  /* 3. Scenery, but never on the trail. */
  for (let y = 0; y < MAP_H; y++) {
    const band = ZONES[bandOfRow(y)];
    for (let x = 0; x < MAP_W; x++) {
      if (tiles[idx(x, y)] !== T.grass) continue;
      const r = rng();
      // Denser and darker the deeper you go, which is most of how the bands read.
      const density = 0.22 + band.id * 0.05;
      if (r < density * 0.55) tiles[idx(x, y)] = T.tree;
      else if (r < density * 0.78) tiles[idx(x, y)] = T.rock;
      else if (r < density * 0.86) tiles[idx(x, y)] = T.stump;
      else if (r < density * 0.92) tiles[idx(x, y)] = T.water;
      else if (r < density * 0.99) tiles[idx(x, y)] = T.flower;
    }
  }

  // A wall of trees along both edges, so the map has a shape.
  for (let y = 0; y < MAP_H; y++) {
    tiles[idx(0, y)] = T.tree;
    tiles[idx(MAP_W - 1, y)] = T.tree;
  }
  for (let x = 0; x < MAP_W; x++) tiles[idx(x, 0)] = T.tree;

  /* 4. The gates, laid across the trail at each band boundary. A gate is the
   *    only way north, so a tool genuinely opens a place rather than just
   *    switching a flag. */
  layGate(tiles, spine, bandRows(1)[0], T.gateAxe);
  layGate(tiles, spine, bandRows(2)[0], T.gateLantern);

  /* 5. The door home. */
  const doorY = MAP_H - 2;
  const doorX = clampX(spine[doorY]);
  for (let d = -1; d <= 1; d++) tiles[idx(clampX(doorX + d), doorY)] = T.door;
  const spawn = { x: doorX, y: doorY - 1 };
  tiles[idx(spawn.x, spawn.y)] = T.path;

  /* 6. Nodes: as many per band as economy.js says the band holds. Placed on
   *    walkable ground, preferring the clearings so the map rewards leaving the
   *    trail. */
  const nodes = [];
  for (const zone of ZONES) {
    const [r0, r1] = bandRows(zone.id);
    for (let n = 0; n < zone.nodes; n++) {
      const spot = findSpot(tiles, rng, r0 + 1, r1 - 1, clearings);
      if (!spot) continue;
      nodes.push({
        x: spot.x,
        y: spot.y,
        zone: zone.id,
        item: rng.pick(zone.items),
        taken: false,
      });
    }
  }

  /* 7. Hazards: wasp nests that sting if you gather beside them. Density is the
   *    band's, which is what makes the deep wood cost something beyond walking. */
  const hazards = [];
  for (const zone of ZONES) {
    const [r0, r1] = bandRows(zone.id);
    const count = Math.round(zone.hazard * 6);
    for (let n = 0; n < count; n++) {
      const spot = findSpot(tiles, rng, r0 + 1, r1 - 1, clearings);
      if (spot) hazards.push({ x: spot.x, y: spot.y, zone: zone.id, angry: 0 });
    }
  }

  const map = { tiles, nodes, hazards, spawn, day };

  /* 8. Prove it, and repair it. Everything above is careful, but "careful" is
   *    what a generator is right up until the day it strands a node behind a
   *    rock. Any node the flood fill cannot see is moved to a tile it can. */
  repair(map, upgrades);
  return map;
}

function clampX(x) {
  return Math.max(1, Math.min(MAP_W - 2, x));
}

function layGate(tiles, spine, row, code) {
  for (let x = 0; x < MAP_W; x++) {
    const t = tiles[idx(x, row)];
    if (t === T.path) tiles[idx(x, row)] = code;
    else if (t < SOLID_FROM) tiles[idx(x, row)] = T.tree;
  }
  void spine;
}

function findSpot(tiles, rng, r0, r1, clearings) {
  // Try the clearings first, then anywhere walkable in the band.
  for (let attempt = 0; attempt < 40; attempt++) {
    let x;
    let y;
    if (attempt < 20 && clearings.length) {
      const c = rng.pick(clearings.filter((k) => k.y >= r0 && k.y <= r1)) || rng.pick(clearings);
      x = clampX(c.x + rng.int(-2, 2));
      y = Math.max(r0, Math.min(r1, c.y + rng.int(-2, 2)));
    } else {
      x = rng.int(1, MAP_W - 2);
      y = rng.int(r0, r1);
    }
    const t = tiles[idx(x, y)];
    if (t === T.grass || t === T.path || t === T.flower) return { x, y };
  }
  return null;
}

/* --- reachability --------------------------------------------------------- */

/**
 * Flood fill from the spawn. Returns a Uint8Array mask over the whole map, and
 * is used by the game (to know which bands are open) and by the harness (to
 * prove no node is orphaned) — the same code both times, so the test cannot
 * drift from the thing it is testing.
 */
export function reachable(map, upgrades) {
  const seen = new Uint8Array(MAP_W * MAP_H);
  const start = idx(map.spawn.x, map.spawn.y);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const k = stack.pop();
    const x = k % MAP_W;
    const y = (k - x) / MAP_W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const nk = idx(nx, ny);
      if (seen[nk] || solid(map.tiles[nk], upgrades)) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  return seen;
}

/** Move any node the player could never have reached onto ground they can. */
function repair(map, upgrades) {
  // Repair against the fully-equipped case: a node behind a gate is not
  // stranded, it is locked, and locking things is the point of the gates.
  const all = ['axe', 'lantern'];
  const seen = reachable(map, all);
  for (const node of map.nodes) {
    if (seen[idx(node.x, node.y)]) continue;
    const [r0, r1] = bandRows(node.zone);
    let moved = false;
    for (let y = r0; y <= r1 && !moved; y++) {
      for (let x = 1; x < MAP_W - 1 && !moved; x++) {
        if (!seen[idx(x, y)]) continue;
        if (map.nodes.some((n) => n !== node && n.x === x && n.y === y)) continue;
        node.x = x;
        node.y = y;
        moved = true;
      }
    }
    node.stranded = !moved;
  }
  void upgrades;
}

/** Which bands the player can actually walk to with what they own. */
export function openBands(map, upgrades) {
  const seen = reachable(map, upgrades);
  const open = new Set();
  for (const zone of ZONES) {
    const [r0, r1] = bandRows(zone.id);
    for (let y = r0; y <= r1 && !open.has(zone.id); y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        if (seen[idx(x, y)]) {
          open.add(zone.id);
          break;
        }
      }
    }
  }
  return open;
}

export { NODE_COST };
