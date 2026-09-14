/*
 * Site-wide identity used by the layout head tags, the JSON-LD structured
 * data, and the generated robots.txt / llms.txt / sitemap.xml. The canonical
 * origin itself lives in astro.config.mjs (`site`), so pages read it from
 * Astro.site and endpoints from context.site — never hardcode it here.
 */

export const SITE = {
  name: 'Beaver Games',
  description:
    'Four free browser games. Blast space chickens, run through the forest, play pinball, or build a woodland shop. No downloads or sign-up.',
  author: 'The Coop',
  locale: 'en',
  // Bump when site content meaningfully changes; feeds dateModified/lastmod.
  updated: '2026-09-14',
  // Default social share image (used when a page has nothing better).
  ogImage: '/media/beaver-games-logo.png',
  ogImageAlt: 'Beaver Games logo',
};

/** JSON-LD-safe serializer: escapes `<` so markup can never break out of the
 *  script tag, even if data ever contains "</script>". */
export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
