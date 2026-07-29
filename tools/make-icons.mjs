/*
 * Generates the PWA icon set without any dependencies: shapes are evaluated
 * per pixel (4x supersampled) and encoded straight into PNG.
 *
 *   node tools/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

/* ----------------------------------------------------------------- helpers -- */

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

function triangle(px, py, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const c = 1 - a - b;
  return a >= 0 && b >= 0 && c >= 0;
}

/** Deterministic star field. */
function stars(size) {
  const list = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const n = Math.round(size / 7);
  for (let i = 0; i < n; i++) {
    list.push({ x: rnd() * size, y: rnd() * size, r: 0.004 * size * (0.5 + rnd()), a: 0.35 + rnd() * 0.65 });
  }
  return list;
}

/**
 * Paint one pixel. `inset` shrinks the artwork for maskable icons so the
 * chicken survives the platform's circular crop.
 */
function paint(x, y, size, starList, inset) {
  const s = size;
  const cx = s * 0.5;
  // Background: deep space gradient with a warm glow behind the chicken.
  const t = y / s;
  let col = mix([9, 12, 32], [4, 5, 14], clamp01(t * 1.1));
  const glow = Math.max(0, 1 - Math.hypot(x - cx, y - s * 0.56) / (s * 0.52));
  col = mix(col, [46, 32, 84], glow * 0.55);

  for (const st of starList) {
    if (circle(x, y, st.x, st.y, st.r)) col = mix(col, [255, 255, 255], st.a);
  }

  // Artwork transform: everything below is expressed in fractions of `size`
  // and then scaled toward the centre by `inset`.
  const ax = cx + (x - cx) / inset;
  const ay = s * 0.5 + (y - s * 0.5) / inset;

  const headR = s * 0.205;
  const headX = cx - s * 0.035;
  const headY = s * 0.43;

  // Body behind the head.
  if (ellipse(ax, ay, cx + s * 0.02, s * 0.7, s * 0.275, s * 0.21)) {
    const shade = clamp01((ay - s * 0.5) / (s * 0.36));
    col = mix([255, 253, 244], [206, 198, 170], shade);
  }

  // Comb.
  for (let i = -1; i <= 1; i++) {
    if (circle(ax, ay, headX + i * s * 0.075, headY - headR * 0.92 - Math.abs(i) * s * 0.01, s * 0.055)) {
      col = [222, 58, 48];
    }
  }

  // Head.
  if (circle(ax, ay, headX, headY, headR)) {
    const d = Math.hypot(ax - (headX - headR * 0.35), ay - (headY - headR * 0.4)) / (headR * 1.7);
    col = mix([255, 255, 250], [214, 206, 180], clamp01(d));
  }

  // Wattle, tucked under the beak.
  if (ellipse(ax, ay, headX + s * 0.075, headY + headR * 0.86, s * 0.03, s * 0.045)) col = [222, 58, 48];

  // Beak.
  if (
    triangle(
      ax, ay,
      headX + headR * 0.72, headY - s * 0.012,
      headX + headR * 1.62, headY + s * 0.042,
      headX + headR * 0.72, headY + s * 0.086
    )
  ) {
    col = [245, 166, 35];
  }

  // Eyes.
  for (const ex of [-0.09, 0.075]) {
    if (circle(ax, ay, headX + s * ex, headY - s * 0.045, s * 0.052)) col = [255, 255, 255];
    if (circle(ax, ay, headX + s * ex + s * 0.012, headY - s * 0.04, s * 0.026)) col = [22, 22, 34];
  }
  // Angry brows.
  for (const ex of [-0.115, 0.05]) {
    if (
      ellipse(ax, ay, headX + s * ex + s * 0.028, headY - s * 0.115, s * 0.06, s * 0.016, ex < 0 ? 0.42 : -0.42)
    ) {
      col = [190, 44, 36];
    }
  }

  // Laser bolts streaking up past the chicken.
  for (const bolt of [
    { x: 0.2, y0: 0.62, y1: 0.9 },
    { x: 0.8, y0: 0.5, y1: 0.82 },
  ]) {
    if (ellipse(x, y, s * bolt.x, s * ((bolt.y0 + bolt.y1) / 2), s * 0.022, s * ((bolt.y1 - bolt.y0) / 2))) {
      col = mix(col, [142, 241, 255], 0.9);
    }
  }

  return col;
}

/* ------------------------------------------------------------- PNG encoding -- */

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
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- build -- */

function render(size, { inset = 1, rounded = 0 } = {}) {
  const starList = stars(size);
  const buf = Buffer.alloc(size * size * 4);
  const SS = 2; // 2x2 supersampling
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
        // Squircle-ish rounded corners for the regular icon.
        const rr = size * rounded;
        const dx = Math.max(0, Math.abs(x + 0.5 - size / 2) - (size / 2 - rr));
        const dy = Math.max(0, Math.abs(y + 0.5 - size / 2) - (size / 2 - rr));
        const d = Math.hypot(dx, dy);
        alpha = Math.round(255 * clamp01(rr - d + 0.5));
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
  { file: 'favicon-64.png', size: 64, opts: { rounded: 0.2 } },
];

for (const t of targets) {
  const png = render(t.size, t.opts);
  writeFileSync(join(OUT_DIR, t.file), png);
  console.log(`${t.file.padEnd(26)} ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} kB`);
}
