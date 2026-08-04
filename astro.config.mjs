// @ts-check
import { defineConfig } from 'astro/config';

// Static output: the site builds to dist/ and is served as Cloudflare Workers
// static assets. The games live in public/ and are copied through untouched,
// so each stays a self-contained PWA under its own path. The /api/* routes are
// handled by the Worker in worker/index.js, not by Astro.
export default defineConfig({
  output: 'static',
  outDir: './dist',
  // Canonical origin for absolute URLs (canonical links, Open Graph, JSON-LD,
  // sitemap.xml, robots.txt, llms.txt). Override with SITE_URL at build time;
  // update the fallback when the site moves to a custom domain.
  site: process.env.SITE_URL || 'https://chicken-attack.radoslav1992.workers.dev',
  // The site ships a strict Content-Security-Policy with no unsafe-inline, so
  // nothing may be inlined: stylesheets stay external, and assetsInlineLimit 0
  // stops Vite from inlining small scripts into <script> tags.
  build: {
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
