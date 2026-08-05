/* Every game in the arcade, booted and prodded.
 *
 * Written as the safety net for extracting the shared platform, but it earns its
 * keep afterwards: it is the check that any change to the plumbing — a service
 * worker, a save key, the leaderboard client, the DPR canvas fit — did not
 * quietly break one of the four games that already work.
 *
 * It deliberately tests the PLUMBING rather than the play. Each game already has
 * its own harness for whether it is any good; this one asks whether it still
 * starts, saves, registers, sizes itself and talks to the arcade page.
 *
 *   node platform-smoke.mjs [port]
 */

import { chromium } from 'playwright';

const PORT = process.argv[2] || 8795;
const BASE = `http://127.0.0.1:${PORT}`;

const GAMES = [
  { slug: 'chicken-attack', start: '#btn-play', keys: ['chicken-attack'] },
  { slug: 'beaver-dash', start: '#btn-start', keys: ['beaver-dash'] },
  { slug: 'orbit-cadet', start: '#btn-start', keys: ['orbit-cadet'] },
  { slug: 'whittle-wares', start: '#btn-start', keys: ['whittle-wares'] },
];

const browser = await chromium.launch();
let failures = 0;
const t = (ok, msg, extra) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}${extra !== undefined ? '   ' + JSON.stringify(extra) : ''}`);
};

for (const game of GAMES) {
  console.log(`\n${game.slug}`);
  const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
  const bad = [];
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() !== 'error') return;
    // A leaderboard POST failing locally is not a plumbing fault.
    if (/api\/scores/.test(text)) return;
    bad.push(text);
  });
  page.on('pageerror', (e) => bad.push(String(e)));

  await page.goto(`${BASE}/${game.slug}/`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // --- it boots, and exposes its game object -------------------------------
  const booted = await page.evaluate(() => !!window.__game);
  t(booted, 'boots and exposes __game');
  if (!booted) {
    await page.close();
    continue;
  }

  // --- the canvas is sized for the device, not for CSS pixels --------------
  const sizing = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return {
      cssW: Math.round(r.width),
      backingW: c.width,
      dpr: window.devicePixelRatio,
      transform: c.getContext('2d').getTransform ? c.getContext('2d').getTransform().a : null,
    };
  });
  t(
    sizing.backingW === Math.round(sizing.cssW * Math.min(sizing.dpr, 2)),
    'canvas backing store matches CSS size x DPR',
    sizing
  );

  // --- it actually starts ---------------------------------------------------
  await page.$eval(game.start, (b) => b.click());
  await page.waitForTimeout(1200);
  const running = await page.evaluate(() => {
    const g = window.__game;
    // Different games name their state differently; any of these means "playing".
    return { state: g.state || g.phase || null, frames: g._raf != null };
  });
  t(running.frames && running.state && running.state !== 'menu', 'starts and runs a loop', running);

  // --- the service worker registers ----------------------------------------
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    return { supported: true, scope: reg ? reg.scope : null };
  });
  t(sw.supported && !!sw.scope && sw.scope.includes(game.slug), 'registers a service worker in its own scope', sw);

  // --- sound preference persists, and the arcade bridge is listening --------
  const sound = await page.evaluate(async (slug) => {
    const before = Object.keys(localStorage).filter((k) => k.includes(slug));
    window.postMessage({ type: 'arcade:set-sound', on: false }, location.origin);
    await new Promise((r) => setTimeout(r, 120));
    return { keys: Object.keys(localStorage).filter((k) => k.includes(slug)), before };
  }, game.slug);
  t(sound.keys.length > 0, 'persists something under its own key prefix', { keys: sound.keys });

  t(bad.length === 0, 'no console errors', bad.slice(0, 3));
  await page.close();
}

/* --- the arcade pages, which is where players actually meet the games ----- */
console.log('\narcade pages');
for (const game of GAMES) {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  const bad = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/api\/scores/.test(m.text())) bad.push(m.text());
  });
  page.on('pageerror', (e) => bad.push(String(e)));
  await page.goto(`${BASE}/games/${game.slug}/`, { waitUntil: 'networkidle' });
  // The start button pulses, so Playwright never calls it "stable" — click it directly.
  await page.$eval('[data-start]', (b) => b.click());
  await page.waitForTimeout(1600);
  const frame = page
    .frames()
    .find((f) => f !== page.mainFrame() && f.url().includes(`/${game.slug}/`));
  const ok = frame ? await frame.evaluate(() => !!window.__game) : false;
  t(ok && bad.length === 0, `${game.slug} boots inside its arcade page`, bad.slice(0, 2));
  await page.close();
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
await browser.close();
process.exit(failures ? 1 : 0);
