import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { GAMES } from '../src/data/games.js';
import { levelScore, deathScore, SKILL } from '../public/freedoom/js/score.js';

const dir = 'public/freedoom';
const MIB = 1024 * 1024;
/* freedoom2.wad as shipped in the Ubuntu 24.04 package freedoom 0.13.0-1. */
const WAD_SHA256 = '5a9315fb7dedac6d11b42034d15b7f6828826b94c84c14078087fa4c97d88474';

test('the game data is Freedoom: Phase 2, intact, and small enough to deploy', () => {
  const gz = readFileSync(`${dir}/data/freedoom2.wad.gz`);
  /* Cloudflare refuses any single static asset over 25 MiB. */
  assert.ok(gz.length < 25 * MIB, `${(gz.length / MIB).toFixed(1)} MiB is over the per-file limit`);
  const wad = gunzipSync(gz);
  assert.equal(wad.toString('latin1', 0, 4), 'IWAD');
  const lumps = wad.readInt32LE(4);
  const directory = wad.readInt32LE(8);
  const names = new Set();
  for (let i = 0; i < lumps; i++)
    names.add(wad.toString('latin1', directory + i * 16 + 8, directory + i * 16 + 16).replace(/\0.*$/, ''));
  /* FREEDOOM is the marker lump the engine looks for; MAP01-MAP32 are the levels. */
  assert.ok(names.has('FREEDOOM'), 'this is not a Freedoom data file');
  for (let m = 1; m <= 32; m++) assert.ok(names.has(`MAP${String(m).padStart(2, '0')}`), `MAP${m} is missing`);
  assert.equal(
    createHash('sha256').update(wad).digest('hex'),
    WAD_SHA256,
    'the data file is not the freedoom2.wad this build was made with',
  );
  /* the page's progress bar is sized from this number */
  const main = readFileSync(`${dir}/js/main.js`, 'utf8');
  assert.match(main, new RegExp(`const WAD_BYTES = ${gz.length};`));
});

test('the engine build is present and the page loads it the way the CSP allows', () => {
  const wasm = readFileSync(`${dir}/engine/freedoom.wasm`);
  assert.equal(wasm.readUInt32LE(0), 0x6d736100, 'not a WebAssembly module');
  const glue = readFileSync(`${dir}/engine/freedoom.js`, 'utf8');
  for (const fn of ['_web_main', '_web_key', '_web_mouse_move', '_web_mouse_button', '_web_opl_render', '_web_wants_mouse'])
    assert.ok(glue.includes(fn), `the engine does not export ${fn}`);
  /* The site's policy forbids eval; the build must not need it. */
  assert.ok(!/\beval\(|new Function\(/.test(glue), 'the engine glue uses eval, which the CSP blocks');
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /script-src 'self' 'wasm-unsafe-eval';/, 'WebAssembly needs wasm-unsafe-eval in script-src');
  assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(headers), 'the policy must stay free of unsafe-inline and unsafe-eval');
  assert.match(headers, /\/freedoom\/sw\.js\n\s+Cache-Control: no-cache/);
});

test('everything the licences require is shipped with the game', () => {
  for (const file of ['COPYING-GPL2.txt', 'COPYING-FREEDOOM.txt', 'CREDITS-FREEDOOM.txt', 'SOURCE.txt'])
    assert.ok(statSync(`${dir}/licenses/${file}`).size > 500, file);
  assert.match(readFileSync(`${dir}/licenses/COPYING-GPL2.txt`, 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
  const bsd = readFileSync(`${dir}/licenses/COPYING-FREEDOOM.txt`, 'utf8').replace(/\s+/g, ' ');
  assert.match(bsd, /Contributors to the Freedoom project/);
  assert.match(bsd, /Redistributions in binary form must reproduce the above copyright notice/);

  /* GPL: the source is offered from the same place as the binary. */
  const source = readFileSync(`${dir}/licenses/SOURCE.txt`, 'utf8');
  const tarball = `${dir}/source/crispy-doom_6.0.orig.tar.gz`;
  assert.ok(source.includes('../source/crispy-doom_6.0.orig.tar.gz') && existsSync(tarball));
  assert.equal(readFileSync(tarball).readUInt16BE(0), 0x1f8b, 'the source bundle is not a gzip archive');
  for (const file of ['build.sh', 'README.md', 'crispy-doom-6.0-web.patch', 'web/web_video.c', 'web/web_input.c', 'web/web_sound.c', 'web/opl_web.c', 'web/SDL.h'])
    assert.ok(existsSync(`tools/freedoom/${file}`), `tools/freedoom/${file}`);
  for (const file of ['web_video.c', 'web_input.c', 'web_sound.c', 'opl_web.c', 'web_events.c', 'web_stubs.c'])
    assert.match(readFileSync(`tools/freedoom/web/${file}`, 'utf8'), /GNU General Public License/, `${file} needs its licence header`);

  /* The start screen links every one of them, and says whose game this is. */
  const html = readFileSync(`${dir}/index.html`, 'utf8');
  for (const href of ['licenses/COPYING-FREEDOOM.txt', 'licenses/CREDITS-FREEDOOM.txt', 'licenses/COPYING-GPL2.txt', 'licenses/SOURCE.txt'])
    assert.ok(html.includes(`href="${href}"`), href);
  assert.match(html, /not affiliated with id Software/i);
});

test('the catalog credits the Freedoom project, not the arcade', () => {
  const entry = GAMES.find((g) => g.slug === 'freedoom');
  assert.ok(entry && entry.playable);
  assert.equal(entry.author.name, 'The Freedoom project');
  assert.match(entry.meta.developer, /Freedoom/);
  for (const path of [entry.art, entry.stageArt, entry.icon, entry.ogImage]) assert.ok(existsSync(`public${path}`), path);
  /* It is Freedoom. The page must not pass it off as the game it is compatible with. */
  const copy = JSON.stringify(entry);
  assert.ok(!/doom\s*(ii|2)\b/i.test(copy.replace(/Freedoom/g, '')), 'do not market this as another game');
});

test('a level is worth more for kills, secrets, speed and skill, and never less than nothing', () => {
  const base = { kills: 10, totalKills: 20, items: 4, secrets: 1, seconds: 300, skill: 2 };
  const score = levelScore(base);
  assert.equal(score, 1000 + 1000 + 100 + 500 + 1500);
  assert.ok(levelScore({ ...base, kills: 11 }) > score);
  assert.ok(levelScore({ ...base, secrets: 2 }) > score);
  assert.ok(levelScore({ ...base, seconds: 200 }) > score);
  assert.equal(levelScore({ ...base, seconds: 5000 }), score - 1500, 'a slow level loses the pace bonus, no more');
  assert.equal(levelScore({ ...base, kills: 20 }) - levelScore({ ...base, kills: 19 }), 1100, 'clearing the level adds a bonus');
  for (let skill = 0; skill < SKILL.length - 1; skill++)
    assert.ok(levelScore({ ...base, skill: skill + 1 }) > levelScore({ ...base, skill }));
  assert.equal(levelScore({ ...base, skill: 99 }), score, 'an unknown skill counts as normal');
  assert.equal(deathScore({ kills: 8, skill: 2 }), 400);
  assert.equal(deathScore({ kills: 0, skill: 4 }), 0);
  /* thirty perfect levels on the hardest skill still fit the leaderboard's limit */
  assert.ok(30 * levelScore({ kills: 300, totalKills: 300, items: 200, secrets: 20, seconds: 0, skill: 4 }) < 100_000_000);
});
