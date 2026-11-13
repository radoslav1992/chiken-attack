/*
 * Share images: one 1200x630 JPEG per game plus one for the arcade, written to
 * public/media/og/. These are what a link to the site looks like in a chat, a
 * post or a search result that shows a picture.
 *
 * They are built from the same card art and fonts the site uses, so they stay
 * in step with it: add a game to src/data/games.js, re-run, commit the JPEG.
 *
 *   node tools/make-og-images.mjs
 *
 * Needs Playwright with Chromium, which is not a dependency of this repo
 * (the site itself has no use for a browser at build time):
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *
 * JPEG rather than WebP or SVG on purpose: several link-preview fetchers still
 * refuse those two, and some skip any picture over a few hundred kilobytes,
 * which rules out PNG for artwork this busy.
 */

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYABLE } from '../src/data/games.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const OUT = join(PUBLIC, 'media', 'og');

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const dataUri = (path) =>
  `data:${MIME[extname(path)]};base64,${readFileSync(join(PUBLIC, path)).toString('base64')}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const css = `
  @font-face { font-family: Bungee; src: url(${dataUri('fonts/bungee.woff2')}); }
  @font-face { font-family: Grotesk; src: url(${dataUri('fonts/space-grotesk.woff2')}); font-weight: 300 700; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #141715; color: #f6f4e9; font-family: Grotesk, sans-serif; }
  .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; image-rendering: auto; }
  .shade { position: absolute; inset: 0; background: linear-gradient(90deg, #141715f2 0%, #141715cc 38%, #14171533 72%, #14171500 100%), linear-gradient(0deg, #141715cc 0%, #14171500 45%); }
  .copy { position: absolute; left: 64px; right: 64px; bottom: 60px; }
  .tag { display: inline-block; font-weight: 700; font-size: 24px; letter-spacing: .14em; text-transform: uppercase; color: #141715; background: #c7ee85; padding: 8px 16px; border-radius: 6px; margin-bottom: 26px; }
  h1 { font-family: Bungee, sans-serif; font-weight: 400; font-size: 104px; line-height: .98; max-width: 820px; text-shadow: 6px 6px 0 #e2473b; }
  h1.long { font-size: 84px; }
  p { font-size: 34px; line-height: 1.3; max-width: 760px; margin-top: 26px; color: #f6f4e9; }
  .brand { position: absolute; left: 64px; top: 52px; display: flex; align-items: center; gap: 16px; font-family: Bungee, sans-serif; font-size: 30px; letter-spacing: .04em; }
  .brand img { height: 64px; }
  .free { position: absolute; right: 64px; top: 58px; font-weight: 700; font-size: 26px; color: #141715; background: #fdb951; padding: 10px 20px; border-radius: 8px; }
  .grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); }
  .grid img { width: 100%; height: 100%; object-fit: cover; }
`;

const brand = `<div class="brand"><img src="${dataUri('media/beaver-games-mark.webp')}" alt="" />BEAVER GAMES</div>`;

function gamePage(g) {
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <img class="art" src="${dataUri(g.art.slice(1))}" alt="" />
    <div class="shade"></div>${brand}
    <div class="free">Free · no download</div>
    <div class="copy">
      <span class="tag">${esc(g.meta.genreLine)}</span>
      <h1 class="${g.title.length > 13 ? 'long' : ''}">${esc(g.title)}</h1>
      <p>${esc(g.share)}</p>
    </div>`;
}

function sitePage() {
  const tiles = PLAYABLE.slice(0, 6)
    .map((g) => `<img src="${dataUri(g.art.slice(1))}" alt="" />`)
    .join('');
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>
    <div class="grid">${tiles}</div>
    <div class="shade"></div>${brand}
    <div class="free">Free · no download</div>
    <div class="copy">
      <span class="tag">${PLAYABLE.length} browser games</span>
      <h1 class="long">Small games.<br />Big rematch energy.</h1>
      <p>Play in seconds on any phone or laptop. No sign-up, no ads.</p>
    </div>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const shoot = async (html, name) => {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 });
  console.log(`wrote public/media/og/${name}.jpg`);
};
await shoot(sitePage(), 'beaver-games');
for (const g of PLAYABLE) await shoot(gamePage(g), g.slug);
await browser.close();
