/*
 * Generates the Whittle & Wares icon set — the same dependency-free per-pixel
 * PNG writer as the other three, drawing this game's mark: a shop awning over a
 * counter, on the forest palette.
 *
 * Deliberately drawn as PIXELS rather than smooth shapes, at a low internal
 * resolution scaled up with hard edges. The game is pixel art; an icon with
 * antialiased curves would be the first thing a player sees and the only part
 * that lies about what is inside.
 *
 *   node tools/make-whittle-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'whittle-wares', 'icons');

/* The mark, at 16x16. '.' is the background. */
const ART = [
  '................',
  '...bbbbbbbbbb...',
  '..bwwrrwwrrwwb..',
  '..bwwrrwwrrwwb..',
  '..bbbbbbbbbbbb..',
  '..bkkkkkkkkkkb..',
  '..bkggkkkkggkb..',
  '..bkggkkkkggkb..',
  '..bkkkkffkkkkb..',
  '..bkkkfffkkkkb..',
  '..bkkkkffkkkkb..',
  '..bccccccccccb..',
  '..bcaaccccaacb..',
  '..bccccccccccb..',
  '...bbbbbbbbbb...',
  '................',
];

const PAL = {
  b: [24, 34, 26],
  w: [238, 243, 228],
  r: [226, 121, 74],
  k: [33, 48, 31],
  g: [255, 194, 74],
  f: [121, 196, 106],
  c: [107, 74, 47],
  a: [138, 97, 61],
};

const BG_TOP = [32, 48, 35];
const BG_BOT = [18, 26, 20];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* --- PNG ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- render --------------------------------------------------------------- */

function render(size, { inset = 1, rounded = 0 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const art = ART.length;
  const cell = (size * inset) / art;
  const pad = (size - cell * art) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Background: a vertical gradient, so the mark sits on something.
      const t = y / size;
      let c = [
        Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
        Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
        Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
      ];

      // The mark, nearest-neighbour: hard pixel edges at every size.
      const ax = Math.floor((x - pad) / cell);
      const ay = Math.floor((y - pad) / cell);
      if (ax >= 0 && ay >= 0 && ax < art && ay < art) {
        const ch = ART[ay][ax];
        if (ch !== '.' && PAL[ch]) c = PAL[ch];
      }

      let alpha = 255;
      if (rounded) {
        const rr = size * rounded;
        const dx = Math.max(0, Math.abs(x + 0.5 - size / 2) - (size / 2 - rr));
        const dy = Math.max(0, Math.abs(y + 0.5 - size / 2) - (size / 2 - rr));
        alpha = Math.round(255 * clamp01(rr - Math.hypot(dx, dy) + 0.5));
      }

      const i = (y * size + x) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = alpha;
    }
  }
  return encodePng(size, size, buf);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, opts: { rounded: 0.22, inset: 0.86 } },
  { file: 'icon-512.png', size: 512, opts: { rounded: 0.22, inset: 0.86 } },
  { file: 'icon-maskable-512.png', size: 512, opts: { inset: 0.62 } },
  { file: 'apple-touch-icon.png', size: 180, opts: { inset: 0.86 } },
];

for (const t of targets) {
  writeFileSync(join(OUT_DIR, t.file), render(t.size, t.opts));
  console.log(`wrote ${t.file}`);
}
