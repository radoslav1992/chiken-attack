/*
 * Generates the Orbit Cadet icon set — same dependency-free per-pixel PNG
 * approach as the other two generators, different subject: a chrome pinball
 * streaking across a starfield, with the flipper that just hit it.
 *
 *   node tools/make-orbit-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'orbit-cadet', 'icons');

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const circle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) <= r;

function capsule(px, py, x1, y1, x2, y2, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp01(t);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)) <= r;
}

function stars(size) {
  const list = [];
  let seed = 991;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < Math.round(size / 6); i++) {
    list.push({ x: rnd() * size, y: rnd() * size, r: 0.004 * size * (0.5 + rnd()), a: 0.25 + rnd() * 0.7 });
  }
  return list;
}

function paint(x, y, size, starList, inset) {
  const s = size;
  // Deep space, lighter toward the top-right where the ball came from.
  let col = mix([16, 13, 34], [8, 7, 15], clamp01((y / s) * 1.1));
  const glow = Math.max(0, 1 - Math.hypot(x - s * 0.72, y - s * 0.26) / (s * 0.55));
  col = mix(col, [123, 92, 255], glow * 0.3);
  for (const st of starList) {
    if (circle(x, y, st.x, st.y, st.r)) col = mix(col, [246, 239, 227], st.a);
  }

  const ax = s * 0.5 + (x - s * 0.5) / inset;
  const ay = s * 0.5 + (y - s * 0.5) / inset;

  // Motion trail behind the ball, warm at the tail.
  const trail = capsule(ax, ay, s * 0.3, s * 0.72, s * 0.6, s * 0.4, s * 0.05);
  if (trail) {
    const t = clamp01((ax - s * 0.3) / (s * 0.3));
    col = mix(col, mix([255, 82, 64], [255, 180, 61], t), 0.5 * t + 0.15);
  }

  // The flipper, angled as though it has just fired.
  if (capsule(ax, ay, s * 0.2, s * 0.82, s * 0.44, s * 0.7, s * 0.055)) {
    col = [255, 82, 64];
    if (capsule(ax, ay, s * 0.2, s * 0.8, s * 0.44, s * 0.68, s * 0.018)) col = [255, 138, 112];
  }

  // The ball: chrome, so a bright highlight and a dark lower limb.
  const bx = s * 0.63;
  const by = s * 0.37;
  const br = s * 0.17;
  if (circle(ax, ay, bx, by, br)) {
    const nx = (ax - bx) / br;
    const ny = (ay - by) / br;
    const lit = clamp01(1 - Math.hypot(nx + 0.42, ny + 0.46) / 1.5);
    col = mix([90, 96, 124], [255, 255, 255], lit * lit);
    // A rim of amber bounce light from below.
    const rim = clamp01(Math.hypot(nx - 0.3, ny - 0.7) / 1.6);
    col = mix(col, [255, 180, 61], (1 - rim) * 0.28);
  }

  return col;
}

/* --- PNG encoding (shared approach with the other icon tools) --- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
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
      let r = 0;
      let g = 0;
      let b = 0;
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
