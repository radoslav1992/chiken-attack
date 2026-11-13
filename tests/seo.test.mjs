import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { PLAYABLE } from '../src/data/games.js';
import { SITE } from '../src/data/site.js';
import { GET as robots } from '../src/pages/robots.txt.js';
import { GET as sitemap } from '../src/pages/sitemap.xml.js';
import { GET as llms } from '../src/pages/llms.txt.js';

const site = new URL('https://arcade.test');
const text = async (endpoint) => (await endpoint({ site })).text();

/** Width and height of a baseline or progressive JPEG, from its frame header. */
function jpegSize(file) {
  const b = readFileSync(file);
  assert.equal(b.readUInt16BE(0), 0xffd8, `${file} is not a JPEG`);
  for (let i = 2; i < b.length; ) {
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: no frame header`);
}

test('every title and description fits what a search result shows', () => {
  assert.ok(SITE.title.length <= 60, `home title is ${SITE.title.length}`);
  assert.ok(SITE.description.length >= 120 && SITE.description.length <= 160, `home description is ${SITE.description.length}`);
  assert.match(SITE.title, /free/i);
  const titles = new Set([SITE.title]);
  const descriptions = new Set([SITE.description]);
  for (const g of PLAYABLE) {
    const { title, description } = g.seo;
    assert.ok(title.length <= 60, `${g.slug} title is ${title.length} characters`);
    assert.ok(title.startsWith(g.title), `${g.slug} title should lead with the game's name`);
    assert.match(title, /free/i, `${g.slug} title should say it is free`);
    assert.ok(title.endsWith(`| ${SITE.name}`), `${g.slug} title should end with the site name`);
    assert.ok(
      description.length >= 120 && description.length <= 160,
      `${g.slug} description is ${description.length} characters`,
    );
    assert.ok(description.includes(g.title), `${g.slug} description should name the game`);
    assert.ok(!/["<>]/.test(title + description), `${g.slug}: keep quotes and angle brackets out of meta text`);
    titles.add(title);
    descriptions.add(description);
  }
  assert.equal(titles.size, PLAYABLE.length + 1, 'titles must be unique');
  assert.equal(descriptions.size, PLAYABLE.length + 1, 'descriptions must be unique');
});

test('every page has a 1200x630 share image light enough for link previews', () => {
  for (const path of [SITE.ogImage, ...PLAYABLE.map((g) => g.ogImage)]) {
    const file = `public${path}`;
    assert.ok(existsSync(file), `${path} is missing — run node tools/make-og-images.mjs`);
    assert.deepEqual(jpegSize(file), [1200, 630], path);
    assert.ok(statSync(file).size < 300_000, `${path} is too heavy for some preview fetchers`);
  }
  for (const g of PLAYABLE) assert.ok(g.share.length <= 70, `${g.slug} share line is too long for the card`);
});

test('art the pages load is a modern format, and the files exist', () => {
  for (const g of PLAYABLE)
    for (const path of [g.art, g.stageArt]) {
      assert.ok(existsSync(`public${path}`), path);
      assert.match(path, /\.(webp|svg)$/, `${path}: ship WebP or SVG, not PNG`);
      assert.ok(statSync(`public${path}`).size < 150_000, `${path} is over 150 KB`);
    }
});

test('a game played on its own page names the arcade page as canonical', () => {
  for (const g of PLAYABLE) {
    const html = readFileSync(`public/${g.slug}/index.html`, 'utf8');
    assert.ok(
      html.includes(`<link rel="canonical" href="/games/${g.slug}/" />`),
      `public/${g.slug}/index.html needs a canonical link to /games/${g.slug}/`,
    );
    assert.match(html, /<meta\s+name="description"/, `${g.slug} shell needs a description`);
  }
});

test('internal links use the canonical URL, never the ?play=1 spelling', () => {
  for (const file of ['src/pages/index.astro', 'src/components/Header.astro', 'src/components/Footer.astro', 'src/pages/games/[slug].astro']) {
    const source = readFileSync(file, 'utf8');
    const hrefs = [...source.matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);
    for (const href of hrefs) assert.ok(!href.includes('play=1'), `${file}: ${href}`);
  }
});

test('robots.txt has one group per agent and keeps the API out for all of them', async () => {
  const body = await text(robots);
  const groups = body
    .split(/\n\s*\n/)
    .map((g) => g.split('\n').filter((l) => l && !l.startsWith('#')))
    .filter((g) => g[0]?.startsWith('User-agent:'));
  const agents = groups.map((g) => g[0]);
  assert.equal(new Set(agents).size, agents.length, 'an agent appears in two groups');
  assert.ok(agents.includes('User-agent: *'));
  for (const g of groups) {
    assert.ok(g.includes('Allow: /'), g[0]);
    assert.ok(g.includes('Disallow: /api/'), `${g[0]} can crawl /api/`);
  }
  assert.ok(body.includes('Sitemap: https://arcade.test/sitemap.xml'));
});

test('the sitemap lists the home page and every game once, with its pictures', async () => {
  const xml = await text(sitemap);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['https://arcade.test/', ...PLAYABLE.map((g) => `https://arcade.test/games/${g.slug}/`)]);
  assert.ok(xml.includes('xmlns:image='));
  for (const g of PLAYABLE) assert.ok(xml.includes(`<image:loc>https://arcade.test${g.ogImage}</image:loc>`));
  assert.ok(!xml.includes('play=1'));
  assert.match(xml, new RegExp(`<lastmod>${SITE.updated}</lastmod>`));
});

test('llms.txt names every game with its page', async () => {
  const body = await text(llms);
  for (const g of PLAYABLE) assert.ok(body.includes(`[${g.title}](https://arcade.test/games/${g.slug}/)`));
});
