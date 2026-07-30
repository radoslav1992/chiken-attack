/*
 * Crops a header-sized mark out of the full logo.
 *
 * The logo is square with "BEAVER GAMES" baked into it, which means the header
 * had to choose between a tall header and unreadable lettering. This cuts the
 * mascot out on its own, so the header can pair a small crisp badge with real
 * CSS type beside it.
 *
 * A committed tool rather than a one-off crop: replace the logo and re-run.
 *
 *   node tools/make-brand-mark.mjs            # crop + write
 *   node tools/make-brand-mark.mjs --profile  # print the alpha profile only
 */

import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, 'public', 'media');
const SRC = join(MEDIA, 'beaver-games-logo.png');
const OUT = join(MEDIA, 'beaver-games-mark.png');

/* --- decode ------------------------------------------------------------- */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`expected 8-bit, got ${depth}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour];
  if (!channels) throw new Error(`unsupported colour type ${colour}`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    // Undo the per-row filter. Byte-wise, with `bpp` as the left offset.
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      switch (filter) {
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: break; // 0 = None
      }
    }
    // Expand whatever channel layout we have into RGBA.
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 4;
      if (channels === 4) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3];
      } else if (channels === 3) {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1];
      } else {
        out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255;
      }
    }
    prev = line;
  }
  return { width, height, rgba: out };
}

/* --- encode (same approach as the icon generators) ---------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
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

/* --- find the mascot ---------------------------------------------------- */

if (!existsSync(SRC)) {
  console.error(`no logo at ${SRC} — nothing to crop`);
  process.exit(1);
}
const img = decodePng(readFileSync(SRC));
const { width: W, height: H, rgba } = img;
const alphaAt = (x, y) => rgba[(y * W + x) * 4 + 3];

/* Per-row coverage: how wide the opaque content is on each row. The wordmark's
 * banner is markedly wider than the mascot above it, so the row where coverage
 * jumps and stays high is where the lettering starts. */
const rows = [];
for (let y = 0; y < H; y++) {
  let min = -1;
  let max = -1;
  let n = 0;
  for (let x = 0; x < W; x++) {
    if (alphaAt(x, y) > 40) {
      if (min < 0) min = x;
      max = x;
      n++;
    }
  }
  rows.push({ y, min, max, n, span: max - min });
}
const content = rows.filter((r) => r.n > 0);
if (!content.length) {
  console.error('the logo appears to be entirely transparent');
  process.exit(1);
}
const top = content[0].y;
const bottom = content[content.length - 1].y;
const maxSpan = Math.max(...content.map((r) => r.span));

if (process.argv.includes('--profile')) {
  console.log(`content rows ${top}..${bottom}, widest span ${maxSpan}`);
  for (let y = top; y <= bottom; y += Math.max(1, Math.round((bottom - top) / 40))) {
    const r = rows[y];
    const bar = '#'.repeat(Math.round((r.span / maxSpan) * 50));
    console.log(`${String(y).padStart(4)} span ${String(r.span).padStart(4)} ${bar}`);
  }
  process.exit(0);
}

/* Locate the wordmark by its width. The lettering sits on a banner markedly
 * wider than the mascot above it — measured on this logo, 756-781 px against
 * 596-642 — so a threshold between the two isolates the band cleanly.
 *
 * Note this finds the band and then walks up to ITS top edge. Walking up from
 * the bottom of the image instead does not work: the banner's chevron tips taper
 * to almost nothing, so the first row tested is already narrow and the search
 * stops before it has started. */
const WIDE = maxSpan * 0.88;
let cut = -1;
for (let y = bottom; y >= top; y--) {
  if (rows[y].span >= WIDE) {
    cut = y;
    break;
  }
}
if (cut > top) {
  while (cut > top && rows[cut - 1].span >= WIDE) cut--;
  cut -= 1; // sit just above the banner
}

/* Width detection finds the top of the banner, but that is not where the mascot
 * ends: its paws and the controller are drawn OVER the banner, so cutting at the
 * banner's edge slices the controller in half. There is no horizontal line that
 * separates them. So the cut lands above the paws instead, giving a clean head
 * badge — which is what a small header mark wants anyway. Override with --cut=N,
 * and `--profile` prints the row widths to choose from. */
const HEAD_FRACTION = 0.44;
const override = process.argv.find((a) => a.startsWith('--cut='));
cut = override ? Number(override.slice(6)) : Math.round(H * HEAD_FRACTION);

// Guard rails: if the heuristic lands somewhere implausible, fall back to the
// top 58%, which is where the mascot sits in this logo.
if (cut < H * 0.3 || cut > H * 0.8) {
  console.log(`heuristic gave y=${cut}, which looks wrong — using 58% instead`);
  cut = Math.round(H * 0.58);
}

// Tight horizontal bounds over just the kept rows.
let x0 = W;
let x1 = 0;
for (let y = top; y <= cut; y++) {
  if (rows[y].n === 0) continue;
  x0 = Math.min(x0, rows[y].min);
  x1 = Math.max(x1, rows[y].max);
}
const PAD = 6;
x0 = Math.max(0, x0 - PAD);
x1 = Math.min(W - 1, x1 + PAD);
const y0 = Math.max(0, top - PAD);
const y1 = Math.min(H - 1, cut + PAD);

const cw = x1 - x0 + 1;
const ch = y1 - y0 + 1;
const out = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  rgba.copy(out, y * cw * 4, ((y + y0) * W + x0) * 4, ((y + y0) * W + x1 + 1) * 4);
}

/* Downscale. The crop is ~677 px wide but the header shows it at 95 — shipping
 * the full-resolution version would put half a megabyte on every page load for
 * an image nobody sees at that size. This targets roughly 3x the displayed width,
 * which covers a 2x screen with headroom.
 *
 * Area-averaged rather than nearest-neighbour, and premultiplied by alpha so the
 * transparent surround does not bleed dark fringes into the artwork's edges. */
function downscale(src, sw, sh, tw) {
  const th = Math.max(1, Math.round((sh * tw) / sw));
  const dst = Buffer.alloc(tw * th * 4);
  const xr = sw / tw;
  const yr = sh / th;
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor(y * yr);
    const sy1 = Math.min(sh, Math.ceil((y + 1) * yr));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor(x * xr);
      const sx1 = Math.min(sw, Math.ceil((x + 1) * xr));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * sw + sx) * 4;
          const al = src[i + 3] / 255;
          r += src[i] * al;
          g += src[i + 1] * al;
          b += src[i + 2] * al;
          a += src[i + 3];
          n++;
        }
      }
      const d = (y * tw + x) * 4;
      /* Un-premultiply. r holds the sum of colour*alpha with alpha as a 0..1
       * fraction, and `a` the sum of raw 0..255 alphas, so the divisor is `a`
       * alone — dividing by the sample count as well over-brightens everything
       * by a factor of n, which turned a brown beaver bright yellow. */
      const k = a > 0.5 ? 255 / a : 0;
      dst[d] = Math.min(255, Math.round(r * k));
      dst[d + 1] = Math.min(255, Math.round(g * k));
      dst[d + 2] = Math.min(255, Math.round(b * k));
      dst[d + 3] = Math.round(a / n);
    }
  }
  return { data: dst, w: tw, h: th };
}

const wArg = process.argv.find((a) => a.startsWith('--width='));
const targetW = wArg ? Number(wArg.slice(8)) : 340;
const small = cw > targetW ? downscale(out, cw, ch, targetW) : { data: out, w: cw, h: ch };

const png = encodePng(small.w, small.h, small.data);
writeFileSync(OUT, png);
console.log(`source        ${W}x${H}`);
console.log(`content rows  ${top}..${bottom} (widest span ${maxSpan})`);
console.log(`cut           y=${cut}  (${((cut / H) * 100).toFixed(0)}% down)`);
console.log(`cropped       ${cw}x${ch}`);
console.log(`mark          ${small.w}x${small.h}  ->  ${OUT.replace(ROOT + '/', '')}  ${(png.length / 1024).toFixed(1)} kB`);
