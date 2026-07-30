# Beaver Games

An arcade of mobile-first browser games with real leaderboards, built as an Astro site plus a
small API Worker on Cloudflare. The landing page and per-game pages implement the "Beaver Games"
design handoff; each game lives in `public/<slug>/` as a fully self-contained, installable PWA
with its own service worker — the game page launches it in place, right inside the cabinet stage.

Two cabinets are open:

- **Chicken Attack** (`/chicken-attack/`, page at `/games/chicken-attack/`) — an arcade shooter in
  the spirit of *Chicken Invaders*: nine weapons, timed power-ups, alternating bosses, difficulty
  modes, autosaved runs.
- **Beaver Dash** (`/beaver-dash/`, page at `/games/beaver-dash/`) — a one-button endless runner
  where each obstacle asks a different question of that button: hop, full jump, long jump, double
  jump, or *press nothing*. Six weather phases, an acorn combo multiplier, a tail-slam dive.
  Distance is banked alongside the score.

Both are fully playable offline and every pixel and sound in them is generated procedurally at
runtime (Canvas2D + Web Audio) — the repo ships no image or audio assets for gameplay.

## Stack

- **Astro** (static output) for the landing page, game pages and 404 — built to `dist/`.
- **Cloudflare Workers static assets** serve the build; `worker/index.js` handles `/api/*` only
  (`run_worker_first` in `wrangler.jsonc`).
- **Cloudflare D1** stores scores and newsletter signups (`migrations/`).
- The games themselves are plain static files in `public/`, copied through the build verbatim.

## Develop

```bash
npm install
npm run db:migrate:local     # once: create tables in the local D1 (miniflare)
npm run dev                  # wrangler dev → http://localhost:8787 (builds the site first)
```

`wrangler.jsonc` declares `build.command = "npm run build"`, so any bare `wrangler deploy` or
`wrangler dev` — locally, in GitHub Actions, or in Cloudflare's git integration — builds the Astro
site before it runs. A deploy can never ship a stale or missing `dist/`.

`npm run dev:ui` runs the Astro dev server alone (fast page iteration, no API/games).

## Deploy

The production D1 database (`beaver-games`) already exists and its id is committed in
`wrangler.jsonc`; the schema was applied through the dashboard console. From a fresh clone:

```bash
npx wrangler login
npm run deploy
```

(`npm run db:migrate:remote` re-applies `migrations/` — safe to run any time, every statement is
`IF NOT EXISTS`.)

After that, `npm run deploy` is the whole release. CI (`.github/workflows/deploy-cloudflare.yml`)
does the same on pushes to `main` once `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets
exist — it also applies pending D1 migrations before deploying.

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/scores?game=<slug>&period=week\|all&limit=N` | GET | Top scores (week = since Monday 00:00 UTC) |
| `/api/scores` | POST | Submit a run `{ id, game, name, score, wave, difficulty }` — upserts by client run id, so saving a name at game over renames the run instead of duplicating it; a rename can never change the score. `wave` is whatever secondary number the game ranks by: waves cleared in Chicken Attack, metres run in Beaver Dash |
| `/api/signup` | POST | Newsletter signup `{ email }` (honeypot field silently accepted) |

If the D1 binding is missing, reads return empty lists and writes 503 — the site works without
the board, and the games never depend on it (score submission is fire-and-forget).

## Adding a game

1. Drop a self-contained build into `public/<slug>/` — own `index.html`, `sw.js`, manifest,
   assets, **relative paths only**, service worker registered with a relative URL, cache names
   under a unique prefix (cache storage is origin-wide).
2. Add an entry in `src/data/games.js` with `playable: true` — the landing catalog and
   `/games/<slug>/` page generate from it.
3. Add the slug to `KNOWN_GAMES` in `worker/index.js` to open its leaderboard.
4. Add `_headers` cache rules for the new paths, plus card/stage art in `public/media/`.

## Layout

```
src/                        Astro site (Beaver Games design)
  pages/index.astro         landing: hero, ticker, spotlight, catalog, why, leaderboard, signup
  pages/games/[slug].astro  game page: stage with in-place launcher, info, weekly top scores
  pages/404.astro           branded 404
  components/               Header, Footer, Leaderboard (client-side fill from /api/scores)
  data/games.js             the catalog — one entry per cabinet
  styles/global.css         design tokens + all styling (CSP forbids inline styles)
worker/index.js             /api/scores + /api/signup on D1
migrations/                 D1 schema
public/
  chicken-attack/           game — self-contained PWA, unchanged by the site build
  beaver-dash/              game — same shape, own service worker + icons
  fonts/                    self-hosted Bungee, Press Start 2P, Space Grotesk (~49 KB)
  media/                    cabinet/stage art (captured from real gameplay)
  sw.js                     self-destruct stub migrating pre-Astro installs
  _headers                  security headers + cache policy
wrangler.jsonc              Workers config: assets + Worker + D1
tools/make-icons.mjs        Chicken Attack icon set
tools/make-beaver-icons.mjs Beaver Dash icon set   (npm run icons runs both)
```

## Notes that save debugging time

- **CSP**: the site ships `script-src 'self'; style-src 'self'` — no `unsafe-inline`. Astro is
  configured (`inlineStylesheets: 'never'`, `assetsInlineLimit: 0`) so it never inlines styles or
  scripts; if a new page's script silently does nothing, check it didn't get inlined.
- **Game page launcher**: START swaps the poster for a same-origin iframe of the game. The
  page's sound button posts `{ type: 'arcade:set-sound', on }` into the frame; the game listens
  and flips its sound+music settings.
- **Scores**: the game POSTs at game over with a generated run id and re-POSTs after the player
  names the run; the Worker upserts by id and only the name can change.
- **Games' `_headers`/service workers** were not touched by the Astro migration: `/_astro/*` and
  `/fonts/*` are content-hashed/immutable, game files revalidate, both service workers stay
  `no-cache`.

## Chicken Attack (the game)

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Fly | drag anywhere (relative) or follow-finger, switchable in Settings | arrows / WASD | left stick |
| Shoot | auto-fire (default) or hold to fire | Space | A |
| Missile | missile button, or tap with a second finger | X / Z / Ctrl | B |
| Pause | pause button | P / Esc | Start |

Difficulty modes (Rookie/Veteran/Superstar), autosaved runs with a Continue button, nine weapons
with ten power levels, six timed power-ups, two boss archetypes with three phases each, feast
waves, local top-10 plus the global weekly board, `prefers-reduced-motion` support, and a service
worker that keeps it fully playable offline. `window.__game` is exposed for debugging.

## Beaver Dash (the game)

| Action | Touch | Keyboard |
| --- | --- | --- |
| Hop | tap | tap Space / ↑ / W |
| Full jump | hold the tap | hold the key |
| Double jump | tap again mid-air | press again mid-air |
| Tail-slam dive | a third press mid-air | a third press mid-air |
| Pause | pause button | P / Esc |

One button, five verbs. Each obstacle is built to demand exactly one of them:

| Obstacle | Asks for | Why |
| --- | --- | --- |
| Stump | a tap | 0.72–1.05 m, under the ~1.7 m a tap reaches |
| Log raft | a held jump | wide, so a hop lands on it |
| River gap | a *long* jump | needs distance, not height |
| Dam | the double jump | 3.55–4.05 m, above a single jump's 3.23 m apex |
| Heron | nothing at all | flies at 1.35 m, which even a tap clips |

A third press in the air is a tail-slam that smashes stumps and rocks (+75) but spends the rest of
your descent, so diving early leaves you grounded with nothing left for what follows. Acorns build
a multiplier to ×5, clearing something by under 0.42 m pays a near-miss bonus, and a rare fern
shield absorbs one hit.

### Two things worth knowing before changing it

**The simulation is in metres, not pixels.** `mx` is a world position along the run (the beaver's
own `mx` is just `distance`) and `y` is height above ground, positive up; `this.px` converts to
pixels at draw time only. That is what makes the run device-independent — `mps` is a constant of
the design, so every device measures the same metre and the shared leaderboard is comparable. The
view scale takes the *smaller* of what width and height can afford; deriving it from height alone
means a tall narrow phone draws a huge world into a narrow viewport and the warning time on an
approaching obstacle collapses to under half a second.

**Obstacle spacing obeys a law, and `auditPatterns()` enforces it.** Two hazards are only fair at
one of two distances apart: close enough that one jump covers both (up to ~0.72 of a jump span,
since the feet stay above rock height from 0.07 s to 0.58 s of the 0.69 s flight), or far enough
apart to land and jump again (from ~1.25 spans, since touchdown is at 1.0). Anything between is a
dead zone where the player lands *on* the second hazard no matter how well they timed the first —
which is what an unaudited random spawner produces by default, and it reads as the game cheating.
Patterns are hand-authored, never rolled per-obstacle, and no pattern mixes a heron (be grounded)
with a gap (be airborne). The rest between patterns is measured in **seconds of reaction time**,
not metres: at 2.5× speed a fixed metre gap would read 2.5× tighter than it did at the start.
