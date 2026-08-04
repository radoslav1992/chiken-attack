/*
 * robots.txt, generated at build time so the sitemap URL always matches the
 * configured site origin. Everyone is welcome here — including the crawlers
 * that feed AI assistants and AI search (ChatGPT, Claude, Perplexity, Google
 * AI Overviews, Gemini), which are allowed by name so an auditor (or the bot
 * itself) never has to guess.
 *
 * NOTE: Cloudflare can still block these bots at the edge regardless of this
 * file — see the "SEO, GEO & AI crawlers" section of the README.
 */

// Assistant/search/training crawlers we explicitly welcome.
const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'GoogleOther',
  'Applebot-Extended',
  'Amazonbot',
  'DuckAssistBot',
  'MistralAI-User',
  'CCBot',
  'meta-externalagent',
  'meta-externalfetcher',
  'cohere-ai',
  'Bytespider',
];

export function GET(context) {
  const lines = [
    '# Beaver Games — free browser games, no installs, no ads.',
    '# All crawlers are welcome, AI assistants and AI search included.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# The /api/ routes are JSON for the games, not pages worth indexing.',
    'User-agent: *',
    'Disallow: /api/',
    '',
  ];
  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`, 'Allow: /', '');
  }
  lines.push(`Sitemap: ${new URL('/sitemap.xml', context.site).href}`, '');
  lines.push(`# AI manifest: ${new URL('/llms.txt', context.site).href}`, '');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
