import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GAMES } from '../src/data/games.js';
import { levelScore, deathScore, SKILL } from '../public/freedoom/js/score.js';

const dir = 'public/freedoom';
const MIB = 1024 * 1024;
/* freedoom2.wad as shipped in the Ubuntu 24.04 package freedoom 0.13.0-1. */
const WAD_SHA256 = '5a9315fb7dedac6d11b42034d15b7f6828826b94c84c14078087fa4c97d88474';

test('the game data is cut into packs that account for every byte of Freedoom: Phase 2', () => {
  const manifest = JSON.parse(readFileSync(`${dir}/packs.json`, 'utf8'));
  assert.equal(manifest.wad.sha256, WAD_SHA256, 'the packs were not made from the freedoom2.wad this build expects');
  assert.equal(manifest.packs[0].name, 'core');
  assert.equal(manifest.packs[1].name, 'sfx');

  let total = 0;
  for (const pack of manifest.packs) {
    const file = readFileSync(`${dir}/data/${pack.file}`);
    /* Cloudflare refuses any single static asset over 25 MiB. */
    assert.ok(file.length < 25 * MIB);
    assert.equal(file.length, pack.bytes, `${pack.file} is not the size packs.json says`);
    assert.equal(createHash('sha256').update(file).digest('hex'), pack.sha256, `${pack.file} has changed since packs.json was written`);
    /* the URL carries the hash, so the week-long cache on data/ cannot go stale */
    assert.ok(pack.file.includes(pack.sha256.slice(0, 10)), `${pack.file} should be named after its contents`);
    total += file.length;
  }
  assert.deepEqual(
    readdirSync(`${dir}/data`).sort(),
    manifest.packs.map((p) => p.file).sort(),
    'data/ holds a file packs.json does not list, or the other way round',
  );

  /* The ranges say where each stretch of the original file lives. Together
   * they must cover it exactly once, and stay inside their packs. */
  const r = manifest.ranges;
  assert.equal(r.length % 4, 0);
  let at = 0;
  for (let k = 0; k < r.length; k += 4) {
    const [pos, size, pack, offset] = r.slice(k, k + 4);
    assert.equal(pos, at, `a gap or overlap in the game file at byte ${at}`);
    assert.ok(size > 0 && pack < manifest.packs.length && offset + size <= manifest.packs[pack].size);
    at = pos + size;
  }
  assert.equal(at, manifest.wad.size, 'the packs do not reach the end of the game file');

  /* Every level names the packs it needs, and its own pack is one of them. */
  for (let map = 1; map <= 32; map++) {
    const need = manifest.levels[String(map)];
    assert.ok(Array.isArray(need) && need.length > 0, `level ${map} lists no packs`);
    const own = manifest.packs.findIndex((p) => p.name === `m${String(map).padStart(2, '0')}`);
    assert.ok(own > 1 && need.includes(own), `level ${map} does not list its own pack`);
    assert.ok(!need.includes(0) && !need.includes(1), 'core and sfx are loaded for every level, not listed per level');
  }

  /* The point of the exercise: little to wait for, and less overall than gzip managed. */
  const toTitle = manifest.packs[0].bytes;
  const toLevelOne = toTitle + manifest.levels['1'].reduce((n, i) => n + manifest.packs[i].bytes, 0);
  assert.ok(toTitle < 2.2e6, `the core pack is ${(toTitle / 1e6).toFixed(2)} MB`);
  assert.ok(toLevelOne < 2.6e6, `level 1 is playable only after ${(toLevelOne / 1e6).toFixed(2)} MB`);
  assert.ok(total < 9e6, `all packs together are ${(total / 1e6).toFixed(2)} MB`);
});

test('put back together, the packs are the original game file, byte for byte', (t) => {
  /* Node cannot unpack LZMA; Python can. Without Python this check is skipped
   * and the hashes above still pin every pack to what the packer wrote. */
  const python = spawnSync('python3', ['-c', 'import lzma']);
  if (python.status !== 0) return t.skip('python3 with lzma is not available');
  const run = spawnSync('python3', ['tools/freedoom/make-packs.py', 'verify'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.ok(run.stdout.includes(WAD_SHA256));
});

test('the engine build is present and the page loads it the way the CSP allows', () => {
  const wasm = readFileSync(`${dir}/engine/freedoom.wasm`);
  assert.equal(wasm.readUInt32LE(0), 0x6d736100, 'not a WebAssembly module');
  const glue = readFileSync(`${dir}/engine/freedoom.js`, 'utf8');
  for (const fn of ['_web_main', '_web_key', '_web_mouse_move', '_web_mouse_button', '_web_opl_render', '_web_wants_mouse', '_web_wad_init', '_web_wad_alloc', '_web_wad_ready', '_web_lzma_decode'])
    assert.ok(glue.includes(fn), `the engine does not export ${fn}`);
  /* The site's policy forbids eval; the build must not need it. */
  assert.ok(!/\beval\(|new Function\(/.test(glue), 'the engine glue uses eval, which the CSP blocks');
  const headers = readFileSync('public/_headers', 'utf8');
  assert.match(headers, /script-src 'self' 'wasm-unsafe-eval';/, 'WebAssembly needs wasm-unsafe-eval in script-src');
  assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(headers), 'the policy must stay free of unsafe-inline and unsafe-eval');
  assert.match(headers, /\/freedoom\/sw\.js\n\s+Cache-Control: no-cache/);
  /* the list of packs must never be cached for long, or a new build is invisible */
  assert.match(headers, /\/freedoom\/packs\.json\n\s+Cache-Control: public, max-age=0, must-revalidate/);
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
  for (const file of ['build.sh', 'README.md', 'make-packs.py', 'crispy-doom-6.0-web.patch', 'web/web_video.c', 'web/web_input.c', 'web/web_sound.c', 'web/web_wad.c', 'web/opl_web.c', 'web/SDL.h', 'lzma/LzmaDec.c'])
    assert.ok(existsSync(`tools/freedoom/${file}`), `tools/freedoom/${file}`);
  for (const file of ['web_video.c', 'web_input.c', 'web_sound.c', 'web_wad.c', 'opl_web.c', 'web_events.c', 'web_stubs.c'])
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
