/*
 * sitemap.xml, generated from the games list so a new cabinet lands in the
 * sitemap the moment it becomes playable. lastmod tracks SITE.updated.
 */

import { SITE } from '../data/site.js';
import { PLAYABLE } from '../data/games.js';

export function GET(context) {
  const abs = (path) => new URL(path, context.site).href;
  // Each page lists the pictures that belong to it, so image search can find
  // the game art without having to render the page.
  const pages = [
    { path: '/', images: [SITE.ogImage] },
    ...PLAYABLE.map((g) => ({ path: `/games/${g.slug}/`, images: [g.ogImage, g.stageArt] })),
  ];

  const entries = pages
    .map(
      ({ path, images }) =>
        `  <url>\n` +
        `    <loc>${abs(path)}</loc>\n` +
        `    <lastmod>${SITE.updated}</lastmod>\n` +
        images.map((img) => `    <image:image><image:loc>${abs(img)}</image:loc></image:image>\n`).join('') +
        `  </url>`
    )
    .join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    `${entries}\n</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
