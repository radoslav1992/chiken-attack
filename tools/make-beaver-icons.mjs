/*
 * Generates the Beaver Dash icon set — same dependency-free per-pixel PNG
 * approach as make-icons.mjs, different mascot.
 *
 *   node tools/make-beaver-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'beaver-dash', 'icons');

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function circle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) <= r;
}

function ellipse(px, py, cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const dx = px - cx;
  const dy = py - cy;
  const x = dx * c - dy * s;
  const y = dx * s + dy * c;
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}

function rect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function stars(size) {
  const list = [];
  let seed = 4242;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const n = Math.round(size / 8);
  for (let i = 0; i < n; i++) {
    list.push({ x: rnd() * size, y: rnd() * size * 0.6, r: 0.004 * size * (0.5 + rnd()), a: 0.3 + rnd() * 0.6 });
  }
  return list;
}

/** Beaver face on the Beaver Games night palette. */
function paint(x, y, size, starList, inset) {
  const s = size;
  const cx = s * 0.5;
  // Night sky with an amber moon glow, matching the game backdrop.
  let col = mix([24, 20, 48], [12, 10, 20], clamp01((y / s) * 1.15));
  const glow = Math.max(0, 1 - Math.hypot(x - s * 0.8, y - s * 0.18) / (s * 0.4));
  col = mix(col, [255, 180, 61], glow * 0.35);
  for (const st of starList) {
    if (circle(x, y, st.x, st.y, st.r)) col = mix(col, [246, 239, 227], st.a);
  }
  if (circle(x, y, s * 0.8, s * 0.18, s * 0.075)) col = [255, 180, 61];

  const ax = cx + (x - cx) / inset;
  const ay = s * 0.5 + (y - s * 0.5) / inset;

  const fur = [138, 90, 51];
  const furDark = [107, 66, 31];
  const belly = [216, 171, 114];

  // Tail peeking out bottom-left: dark cross-hatched paddle.
  if (ellipse(ax, ay, s * 0.22, s * 0.82, s * 0.17, s * 0.1, 0.5)) {
    col = [87, 57, 28];
    const hatch = Math.abs(((ax + ay) % (s * 0.045)) - s * 0.0225) < s * 0.006;
    if (hatch) col = [66, 42, 18];
  }

  // Ears
  for (const ex of [-0.24, 0.24]) {
    if (circle(ax, ay, cx + s * ex, s * 0.3, s * 0.085)) col = furDark;
    if (circle(ax, ay, cx + s * ex, s * 0.3, s * 0.045)) col = [87, 57, 28];
  }

  // Head: big friendly round face.
  if (ellipse(ax, ay, cx, s * 0.52, s * 0.31, s * 0.29)) {
    const d = Math.hypot(ax - (cx - s * 0.1), ay - s * 0.42) / (s * 0.5);
    col = mix([176, 124, 74], fur, clamp01(d * 1.2));
  }

  // Muzzle
  if (ellipse(ax, ay, cx, s * 0.62, s * 0.17, s * 0.13)) col = belly;

  // Nose
  if (ellipse(ax, ay, cx, s * 0.55, s * 0.055, s * 0.04)) col = [36, 31, 61];

  // Eyes
  for (const ex of [-0.13, 0.13]) {
    if (circle(ax, ay, cx + s * ex, s * 0.45, s * 0.045)) col = [36, 31, 61];
    if (circle(ax, ay, cx + s * ex + s * 0.012, s * 0.44, s * 0.014)) col = [246, 239, 227];
  }

  // The teeth. Non-negotiable.
  if (rect(ax, ay, cx - s * 0.05, s * 0.62, s * 0.046, s * 0.1)) col = [246, 239, 227];
  if (rect(ax, ay, cx + s * 0.004, s * 0.62, s * 0.046, s * 0.1)) col = [246, 239, 227];
  if (rect(ax, ay, cx - s * 0.004, s * 0.62, s * 0.008, s * 0.1)) col = [200, 190, 175];

  // Cheek fuzz marks
  for (const [fx, fy, rot] of [[-0.3, 0.58, 0.3], [0.3, 0.58, -0.3]]) {
    if (ellipse(ax, ay, cx + s * fx, s * fy, s * 0.05, s * 0.012, rot)) col = furDark;
  }

  return col;
}

/* --- PNG encoding (same as make-icons.mjs) --- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
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

function render(size, { inset = 1, rounded = 0 } = {}) {
  const starList = stars(size);
  const buf = Buffer.alloc(size * size * 4);
  const SS = 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = paint(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, starList, inset);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      let alpha = 255;
      if (rounded) {
        const rr = size * rounded;
        const dx = Math.max(0, Math.abs(x + 0.5 - size / 2) - (size / 2 - rr));
        const dy = Math.max(0, Math.abs(y + 0.5 - size / 2) - (size / 2 - rr));
        alpha = Math.round(255 * clamp01(rr - Math.hypot(dx, dy) + 0.5));
      }
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = alpha;
    }
  }
  return encodePng(size, size, buf);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, opts: { rounded: 0.22 } },
  { file: 'icon-512.png', size: 512, opts: { rounded: 0.22 } },
  { file: 'icon-maskable-512.png', size: 512, opts: { inset: 0.72 } },
  { file: 'apple-touch-icon.png', size: 180, opts: {} },
];

for (const t of targets) {
  const png = render(t.size, t.opts);
  writeFileSync(join(OUT_DIR, t.file), png);
  console.log(`${t.file.padEnd(26)} ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} kB`);
}
