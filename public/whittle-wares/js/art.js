/*
 * Whittle & Wares — pixel art, drawn in code.
 *
 * Sprites are written as character grids with a palette per sprite, baked once
 * into offscreen canvases at one canvas pixel per art pixel, and then drawn
 * scaled with smoothing off. That is what keeps the pixels square at any zoom:
 * scaling a 16x16 bake up by 3 gives hard 3x3 blocks, whereas drawing the same
 * shape with scaled fillRects gives you half-pixel seams the moment the camera
 * is not on a whole number.
 *
 * No image files. The whole game is a few kilobytes of strings.
 */

const CACHE = new Map();

/** Bake a character grid into a canvas. `pal` maps each character to a colour;
 *  '.' is always transparent. */
export function sprite(key, rows, pal) {
  const hit = CACHE.get(key);
  if (hit) return hit;
  const w = rows[0].length;
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || !pal[c]) continue;
      g.fillStyle = pal[c];
      g.fillRect(x, y, 1, 1);
    }
  }
  CACHE.set(key, cv);
  return cv;
}

/* --- palette --------------------------------------------------------------
 * A deliberately small set, the way a real 8-bit tileset is small: every new
 * colour is a decision, and a limited set is what makes separate sprites look
 * like they belong to the same game.
 */
export const PAL = {
  ink: '#1b1f2a',
  bark: '#6b4a2f',
  barkLit: '#8a613d',
  leaf: '#2f7d4f',
  leafLit: '#49a866',
  leafDark: '#1d5537',
  grass: '#3f8c52',
  grassAlt: '#357a49',
  grassDeep: '#245c39',
  stone: '#7b8494',
  stoneLit: '#a7b0bd',
  water: '#2f6ea8',
  waterLit: '#4d94cf',
  fur: '#8a5a34',
  furLit: '#b07a4c',
  furDark: '#5d3a20',
  tooth: '#f2e6c8',
  wasp: '#f0c020',
  path: '#a98b5f',
  pathLit: '#c2a578',
  flower: '#e8618c',
  flower2: '#f5d24a',
};

/* --- the beaver -----------------------------------------------------------
 * Two walk frames. Facing is done by flipping at draw time rather than by
 * drawing a second set, which halves the art and guarantees the two directions
 * stay in step with each other.
 */
const BEAVER_PAL = { f: PAL.fur, l: PAL.furLit, d: PAL.furDark, i: PAL.ink, t: PAL.tooth };

const BEAVER_A = [
  '................',
  '.....ddddd......',
  '....dfffffd.....',
  '...dflfffffd....',
  '...dfliffilf....',
  '...dffffffff....',
  '...dfftttfff....',
  '....dffffffd....',
  '...ddffffffdd...',
  '..dlffffffffld..',
  '..dlffffffffld..',
  '...dffffffffd...',
  '....dfd..dfd....',
  '....ddd..ddd....',
  '...dddddddddd...',
  '....dd....dd....',
];

const BEAVER_B = [
  '................',
  '.....ddddd......',
  '....dfffffd.....',
  '...dflfffffd....',
  '...dfliffilf....',
  '...dffffffff....',
  '...dfftttfff....',
  '....dffffffd....',
  '...ddffffffdd...',
  '..dlffffffffld..',
  '..dlffffffffld..',
  '...dffffffffd...',
  '.....dfdfd......',
  '.....dddd.......',
  '...dddddddddd...',
  '.....dd..dd.....',
];

export const beaverFrame = (i) =>
  sprite(`beaver${i}`, i ? BEAVER_B : BEAVER_A, BEAVER_PAL);

/* --- the wasp -------------------------------------------------------------- */

const WASP = [
  '........',
  '..w..w..',
  '.iwwwwi.',
  '.wiwwiw.',
  '..wwww..',
  '..iwwi..',
  '...ww...',
  '....i...',
];

export const waspSprite = () => sprite('wasp', WASP, { w: PAL.wasp, i: PAL.ink });

/* --- tiles ----------------------------------------------------------------
 * 16x16 each, one bake per (tile, band) pair. The band tint is what makes the
 * wood get darker and colder as you walk north without needing four separate
 * tilesets.
 */
const BAND_TINT = ['#000000', '#04121f', '#0a0f22', '#120a20'];
const BAND_ALPHA = [0, 0.14, 0.26, 0.38];

function tileCanvas(draw) {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  draw(cv.getContext('2d'));
  return cv;
}

function tint(cv, band) {
  if (!band) return cv;
  const out = document.createElement('canvas');
  out.width = 16;
  out.height = 16;
  const g = out.getContext('2d');
  g.drawImage(cv, 0, 0);
  g.globalAlpha = BAND_ALPHA[band];
  g.fillStyle = BAND_TINT[band];
  g.fillRect(0, 0, 16, 16);
  g.globalAlpha = 1;
  return out;
}

/* A tiny deterministic hash so the scatter inside a tile is stable — a grass
 * tuft that moves when the camera moves is the fastest way to make pixel art
 * look wrong. */
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bf03635;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
};

const TILE_DRAW = {
  grass(g) {
    g.fillStyle = PAL.grass;
    g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(hash(i, 1) * 16);
      const y = Math.floor(hash(i, 2) * 16);
      g.fillStyle = hash(i, 3) > 0.5 ? PAL.grassAlt : PAL.grassDeep;
      g.fillRect(x, y, 1, 1);
    }
  },
  path(g) {
    g.fillStyle = PAL.path;
    g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(hash(i, 5) * 16);
      const y = Math.floor(hash(i, 6) * 16);
      g.fillStyle = hash(i, 7) > 0.4 ? PAL.pathLit : '#8f7349';
      g.fillRect(x, y, 1, 1);
    }
  },
  flower(g) {
    TILE_DRAW.grass(g);
    g.fillStyle = PAL.flower;
    g.fillRect(6, 6, 2, 2);
    g.fillRect(10, 10, 2, 2);
    g.fillStyle = PAL.flower2;
    g.fillRect(4, 11, 2, 2);
  },
  door(g) {
    g.fillStyle = '#3b2a1c';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.bark;
    g.fillRect(2, 1, 12, 15);
    g.fillStyle = PAL.barkLit;
    g.fillRect(3, 2, 10, 13);
    g.fillStyle = '#2a1c12';
    g.fillRect(5, 5, 6, 10);
    g.fillStyle = PAL.flower2;
    g.fillRect(9, 10, 1, 1);
  },
  tree(g) {
    TILE_DRAW.grass(g);
    g.fillStyle = PAL.bark;
    g.fillRect(7, 10, 3, 6);
    g.fillStyle = PAL.leafDark;
    g.fillRect(3, 1, 11, 10);
    g.fillStyle = PAL.leaf;
    g.fillRect(3, 2, 10, 8);
    g.fillStyle = PAL.leafLit;
    g.fillRect(4, 3, 5, 4);
  },
  rock(g) {
    TILE_DRAW.grass(g);
    g.fillStyle = PAL.ink;
    g.fillRect(2, 6, 13, 9);
    g.fillStyle = PAL.stone;
    g.fillRect(2, 5, 12, 9);
    g.fillStyle = PAL.stoneLit;
    g.fillRect(4, 6, 5, 4);
  },
  water(g) {
    g.fillStyle = PAL.water;
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = PAL.waterLit;
    g.fillRect(2, 4, 6, 1);
    g.fillRect(9, 9, 5, 1);
    g.fillRect(4, 12, 4, 1);
  },
  stump(g) {
    TILE_DRAW.grass(g);
    g.fillStyle = PAL.furDark;
    g.fillRect(4, 7, 9, 7);
    g.fillStyle = PAL.bark;
    g.fillRect(4, 6, 8, 7);
    g.fillStyle = PAL.barkLit;
    g.fillRect(6, 7, 4, 3);
  },
  gateAxe(g) {
    TILE_DRAW.grass(g);
    g.fillStyle = PAL.leafDark;
    for (let i = 0; i < 16; i += 3) {
      g.fillRect(i, 0, 2, 16);
      g.fillRect(0, i, 16, 2);
    }
    g.fillStyle = PAL.flower;
    g.fillRect(5, 5, 2, 2);
    g.fillRect(11, 10, 2, 2);
  },
  gateLantern(g) {
    g.fillStyle = '#0a0d16';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#141a2c';
    g.fillRect(2, 2, 12, 12);
    g.fillStyle = '#232c48';
    g.fillRect(5, 6, 2, 2);
    g.fillRect(10, 9, 2, 2);
  },
};

const TILE_CACHE = new Map();

/** A baked tile, tinted for its band. */
export function tileArt(name, band) {
  const key = `${name}:${band}`;
  const hit = TILE_CACHE.get(key);
  if (hit) return hit;
  const base = tileCanvas(TILE_DRAW[name] || TILE_DRAW.grass);
  const out = tint(base, band);
  TILE_CACHE.set(key, out);
  return out;
}

/* --- resource nodes -------------------------------------------------------
 * One shape per material, coloured from the item's own colour so the icon in
 * the satchel and the thing in the grass are recognisably the same object.
 */
const NODE_SHAPE = {
  bark: ['..cccc..', '.cccccc.', 'cc.cc.cc', 'cccccccc', 'cc.cc.cc', '.cccccc.', '..cccc..', '........'],
  berry: ['........', '..cc.cc.', '.cccccc.', '.cccccc.', '..cccc..', '...cc...', '..dddd..', '........'],
  resin: ['...cc...', '..cccc..', '.cccccc.', 'cccccccc', 'cccccccc', '.cccccc.', '..cccc..', '........'],
  clay: ['........', '..cccc..', '.cccccc.', 'cccccccc', 'cccccccc', 'cccccccc', '.dddddd.', '........'],
  flint: ['....c...', '...cc c.', '..cccccc', '.ccccccc', 'ccccccc.', 'cccccc..', '.cccc...', '..c.....'],
  honey: ['..cccc..', '.cccccc.', 'cc.cc.cc', 'cccccccc', 'cc.cc.cc', '.cccccc.', '..dddd..', '........'],
  ironwood: ['.cc..cc.', '.cc..cc.', '.cccccc.', '.cc..cc.', '.cc..cc.', '.cccccc.', '.cc..cc.', '........'],
  amber: ['...cc...', '..cccc..', '.cccccc.', 'ccc..ccc', 'ccc..ccc', '.cccccc.', '..cccc..', '...cc...'],
};

export function nodeSprite(item, colour) {
  const rows = NODE_SHAPE[item] || NODE_SHAPE.bark;
  return sprite(`node:${item}`, rows, { c: colour, d: PAL.ink });
}

/** Item icons for the satchel and shelves: the node shape at 8x8. */
export function itemIcon(item, colour) {
  const rows = NODE_SHAPE[item];
  if (rows) return nodeSprite(item, colour);
  // Crafted goods get a simple crate-and-lid shape in their own colour.
  return sprite(`icon:${item}`, [
    '........',
    '.cccccc.',
    '.cdddc c',
    '.cccccc.',
    '.cccccc.',
    '.cdddddc',
    '.cccccc.',
    '........',
  ], { c: colour, d: PAL.ink });
}

/** Customers: the same silhouette in a different coat, so a queue reads as a
 *  queue of people rather than one person repeated. */
const COATS = ['#c0553f', '#3f7cc0', '#5b9e4f', '#a05bc0', '#c09a3f', '#3fa8a0'];

const CUSTOMER = [
  '................',
  '......dddd......',
  '.....dccccd.....',
  '.....dciicd.....',
  '.....dccccd.....',
  '......dccd......',
  '....ddkkkkdd....',
  '...dkkkkkkkkd...',
  '...dkkkkkkkkd...',
  '...dkkkkkkkkd...',
  '....dkkkkkkd....',
  '.....dkkkkd.....',
  '.....dkk kd.....',
  '.....dkd dkd....',
  '....ddd...ddd...',
  '................',
];

export function customerSprite(i) {
  const coat = COATS[i % COATS.length];
  return sprite(`cust${i % COATS.length}`, CUSTOMER, {
    c: PAL.furLit,
    d: PAL.ink,
    k: coat,
    i: PAL.ink,
  });
}

/** Draw a baked sprite at an integer position, optionally flipped. */
export function blit(g, cv, x, y, scale, flip) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (!flip) {
    g.drawImage(cv, px, py, cv.width * scale, cv.height * scale);
    return;
  }
  g.save();
  g.translate(px + cv.width * scale, py);
  g.scale(-1, 1);
  g.drawImage(cv, 0, 0, cv.width * scale, cv.height * scale);
  g.restore();
}
