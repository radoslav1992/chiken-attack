/*
 * sitemap.xml, generated from the games list so a new cabinet lands in the
 * sitemap the moment it becomes playable. lastmod tracks SITE.updated.
 */

import { SITE } from '../data/site.js';
import { PLAYABLE } from '../data/games.js';

export function GET(context) {
  const urls = ['/', ...PLAYABLE.map((g) => `/games/${g.slug}/`)];

  const entries = urls
    .map(
      (path) =>
        `  <url>\n` +
        `    <loc>${new URL(path, context.site).href}</loc>\n` +
        `    <lastmod>${SITE.updated}</lastmod>\n` +
        `  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
