/*
 * Site-wide identity used by the layout head tags, the JSON-LD structured
 * data, and the generated robots.txt / llms.txt / sitemap.xml. The canonical
 * origin itself lives in astro.config.mjs (`site`), so pages read it from
 * Astro.site and endpoints from context.site — never hardcode it here.
 */

export const SITE = {
  name: 'Beaver Games',
  // The landing page <title>. Says what the site is before it says anything
  // clever: this is the line a search result shows.
  title: 'Beaver Games — free browser games, no download, no ads',
  // Under 160 characters, or search results cut it off mid-sentence.
  description:
    'Free browser games: space shooter, first-person shooter, endless runner, pinball, shopkeeper RPG, tower defence and platformer. No install, no sign-up, no ads.',
  author: 'The Coop',
  locale: 'en',
  // Bump when site content meaningfully changes; feeds dateModified/lastmod.
  updated: '2026-11-13',
  // Default social share image (used when a page has nothing better).
  // 1200x630, from tools/make-og-images.mjs — the shape link previews expect.
  ogImage: '/media/og/beaver-games.jpg',
  ogImageAlt: 'Beaver Games: free browser games, no download',
  // The square logo, for the Organization in the structured data.
  logo: '/media/beaver-games-logo.png',
  sameAs: ['https://github.com/radoslav1992/chiken-attack'],
};

/** JSON-LD-safe serializer: escapes `<` so markup can never break out of the
 *  script tag, even if data ever contains "</script>". */
export function jsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
