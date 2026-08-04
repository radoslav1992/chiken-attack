/*
 * /llms.txt — the AI-assistant manifest (https://llmstxt.org/): a compact
 * Markdown summary of what this site is, built from the same data the pages
 * render, so it can never drift from what a visitor actually sees.
 */

import { SITE } from '../data/site.js';
import { PLAYABLE } from '../data/games.js';
import { FAQ } from '../data/faq.js';

export function GET(context) {
  const abs = (path) => new URL(path, context.site).href;

  const games = PLAYABLE.map(
    (g) =>
      `- [${g.title}](${abs(`/games/${g.slug}/`)}): ${g.genre}. ${g.blurb} ` +
      `Size ${g.stats.size}, a run takes ${g.stats.runTime}. Released ${g.meta.released} by ${g.meta.developer}.`
  ).join('\n');

  const faq = FAQ.map((item) => `- ${item.q} ${item.a}`).join('\n');

  const body = `# ${SITE.name}

> ${SITE.description} A free hobby arcade by ${SITE.author}: every game is open source, works offline after the first visit, needs no account, and shows no ads.

Key facts:

- All games are free forever — no tiers, no in-app purchases, no ads.
- Nothing to install: each game is a web page under 0.5 MB that loads in under a second (optional PWA install).
- Works offline via per-game service workers; saves live on the device, no accounts.
- Weekly leaderboards reset every Monday at 00:00 UTC.
- Content last updated: ${SITE.updated}.

## Games

${games}

## FAQ

${faq}

## Pages

- [Arcade home](${abs('/')}): catalogue of all games, leaderboard, FAQ.
- [Sitemap](${abs('/sitemap.xml')})

## Source

- [Source code on GitHub](https://github.com/radoslav1992/chiken-attack): the whole site and every game.
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
