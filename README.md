# Beaver Games

An arcade of mobile-first browser games with real leaderboards, built as an Astro site plus a
small API Worker on Cloudflare. The landing page and per-game pages implement the "Beaver Games"
design handoff; each game lives in `public/<slug>/` as a fully self-contained, installable PWA
with its own service worker — the game page launches it in place, right inside the cabinet stage.

Three cabinets are open:

- **Chicken Attack** (`/chicken-attack/`, page at `/games/chicken-attack/`) — an arcade shooter in
  the spirit of *Chicken Invaders*: nine weapons, timed power-ups, alternating bosses, difficulty
  modes, autosaved runs.
- **Beaver Dash** (`/beaver-dash/`, page at `/games/beaver-dash/`) — a one-button endless runner
  where each obstacle asks a different question of that button: hop, full jump, long jump, double
  jump, or *press nothing*. Six weather phases, an acorn combo multiplier, a tail-slam dive.
  Distance is banked alongside the score.

- **Orbit Cadet** (`/orbit-cadet/`, page at `/games/orbit-cadet/`) — a pinball table with a rank to
  climb. Two thumbs, two flippers: arm a mission at the rollover, finish it, and get promoted from
  Cadet to Admiral. Plunger, nudge, tilt, drop-target bank, orbit loop, spinner, multiball.

All three are fully playable offline and every pixel and sound in them is generated procedurally at
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
| `/api/scores` | POST | Submit a run `{ id, game, name, score, wave, difficulty }` — upserts by client run id, so saving a name at game over renames the run instead of duplicating it; a rename can never change the score. `wave` is whatever secondary number the game ranks by: waves cleared in Chicken Attack, metres run in Beaver Dash, rank reached in Orbit Cadet |
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
  orbit-cadet/              game — pinball; physics.js and table.js are pure modules
  fonts/                    self-hosted Bungee, Press Start 2P, Space Grotesk (~49 KB)
  media/                    cabinet/stage art (captured from real gameplay)
  sw.js                     self-destruct stub migrating pre-Astro installs
  _headers                  security headers + cache policy
wrangler.jsonc              Workers config: assets + Worker + D1
tools/make-icons.mjs        Chicken Attack icon set
tools/make-beaver-icons.mjs Beaver Dash icon set
tools/make-orbit-icons.mjs  Orbit Cadet icon set   (npm run icons runs all three)
```

## The brand mark

`src/components/Brand.astro` renders the logo image if one is in `public/media/`, and a CSS
fallback in the same palette if not. It checks at build time — Astro components run in Node — so
adding the logo is the whole job:

```bash
cp your-logo.png public/media/beaver-games-logo.png
npm run build
```

Every header and footer picks it up with no code change. `beaver-games-logo.{png,webp,svg}` and
`logo.{png,svg}` are all accepted, first match wins. A build-time check rather than an `onerror`
attribute because the site's CSP forbids inline handlers, and it means there is never a 404 for a
logo that has not been added yet.

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

A third press in the air is a tail-slam that smashes stumps and rocks (+150) but spends the rest of
your descent, so diving early leaves you grounded with nothing left for what follows. Acorns build
a multiplier to ×5, clearing something by under 0.42 m pays a near-miss bonus, and a rare fern
shield absorbs one hit.

**Distance is the backbone of the score and the constants are tuned together.** A metre is worth 10,
an acorn 5 (×1 to ×5 by combo), and a run meets about 20 acorns per 100 m — so pickups come to
roughly a third of a good run and distance carries the rest. This is easy to break: when acorns
first became genuinely collectable, a 700 m run went from 3,056 points to 42,450 and pickups became
97% of the total, at which point the board was no longer ranking how far anyone had run. Change
`DIST_POINTS`, `ACORN_POINTS` and the chain density as one decision, and check the result — the
`economy` harness measures acorns per 100 m and the resulting share directly.

**Acorn chains are generated from the physics, not drawn by hand.** `jumpPath()` runs the same
integrator the beaver uses and `arc()` samples it, so a chain lies exactly on the path a jump
flies and taking off where the chain starts collects all of it. A hand-drawn symmetric curve
cannot do this: gravity is asymmetric, so the descent is steeper and shorter than the climb and the
apex has a hang plateau — a sine arc puts acorns where the beaver never goes, and no jump, however
well timed, gets them all. Flat chains sit at 0.85 m to be swept up at a run. Collection is a box
around the whole body plus a 0.4 m margin, not a radius from the centre; the radius reached only
1.02 m while grounded, which left a chain at 1.05 m permanently two centimetres out of reach.

### Two things worth knowing before changing it

**The simulation is in metres, not pixels.** `mx` is a world position along the run (the beaver's
own `mx` is just `distance`) and `y` is height above ground, positive up; `this.px` converts to
pixels at draw time only. That is what makes the run device-independent — `mps` is a constant of
the design, so every device measures the same metre and the shared leaderboard is comparable. The
view scale takes the *smaller* of what width and height can afford; deriving it from height alone
means a tall narrow phone draws a huge world into a narrow viewport and the warning time on an
approaching obstacle collapses to under half a second.

The scale floor is a straight trade and worth understanding before touching it: **a bigger world
means fewer metres of visible approach**, because the screen is a fixed number of pixels. On a
390 px-wide phone, `u` 0.68 drew a 31 px beaver with 1.4 s of reading time at base speed; 0.86 draws
40 px with 1.2 s. There is no free lunch here — the only other levers are the beaver's screen x
(moved left on narrow screens) and `mps`, and `mps` cannot change per device without making scores
incomparable. Landscape sits above the floor on its own and gets 2.3 s, which is why the menu
suggests turning the phone.

**Obstacle spacing obeys a law, and `auditPatterns()` enforces it.** Two hazards are only fair at
one of two distances apart: close enough that one jump covers both (up to ~0.72 of a jump span,
since the feet stay above rock height from 0.07 s to 0.58 s of the 0.69 s flight), or far enough
apart to land and jump again (from ~1.25 spans, since touchdown is at 1.0). Anything between is a
dead zone where the player lands *on* the second hazard no matter how well they timed the first —
which is what an unaudited random spawner produces by default, and it reads as the game cheating.
Patterns are hand-authored, never rolled per-obstacle, and no pattern mixes a heron (be grounded)
with a gap (be airborne). The rest between patterns is measured in **seconds of reaction time**,
not metres: at 2.5× speed a fixed metre gap would read 2.5× tighter than it did at the start.

## Orbit Cadet (the game)

| Action | Touch | Keyboard |
| --- | --- | --- |
| Left flipper | the left half of the screen | ← / A / Z / Shift |
| Right flipper | the right half | → / D / ' / slash |
| Launch | hold the strip at the bottom | hold Space |
| Nudge | the bottom corners | , and . (or N) |
| Pause | pause button | P / Esc |

A table where the point is the promotion rather than the score. Roll over MISSION to arm one of
four — clear the drop-target bank, sweep the beacons, run the orbit, work the spinner — and each one
finished moves you a rank, Cadet to Admiral. The rank reached is what goes in the leaderboard's
`wave` column, alongside Chicken Attack's waves and Beaver Dash's metres. Three balls, an extra ball
at Lieutenant, multiball at Commander, and a tilt that kills the flippers on the fourth shove. The
three lanes across the top of the dome light FUEL; light all three and the bonus multiplier steps up,
which is what a hard plunge buys you, since every launch runs the top channel and a fast one crosses
all three.

### The one rule the table is built around

**The only way to lose a ball is through the gate between the flipper tips.** The first cut had wide
open outlanes either side. Measured with no player input at all, 57% of launches drained down the
right and only 43% ever came within a flipper's reach; the median ball lived 2.3 seconds. That is not
difficulty, it is the table refusing to deal you in.

The bottom third is now a pair of funnels whose final approach runs *flush into each flipper pivot* —
nothing fits between a pivot and the wall beside it, so a ball down either side is delivered onto the
flipper rather than past it. The plunger lane is a closed shaft to its own floor, and its top curves
left like a real launch ramp, so a weak plunge is a re-plunge instead of a ball stranded in a corner.

Getting there took two wrong turns worth recording. Killing the outlanes by bolting ledges across
them left the ball circulating in the upper playfield for forty-five seconds without ever coming
down — the fix for "the ball is lost too easily" must not become "the ball is never lost". And
closing the gap beside each pivot opened a notch between the funnel wall and the pivot that was
exactly ball-sized; every one of 240 launches ended parked in it at a speed of 3.

None of that was found by playing. It was found by `oc-space.mjs`, which rasterises every position
the ball's centre may legally occupy, floods it from the upper playfield, and asserts that the only
reachable exit along the table's bottom edge is the central gate. A soak tells you how often balls
*happen* to find a leak; the flood fill finds every leak there is, in a second, and it is what any
change to the lower third should be re-run against.

### Two more things worth knowing before changing it

**`physics.js` and `table.js` are pure modules — no `window`, no `document`.** That is deliberate:
the physics can be tested in Node directly, with no browser, which is what made it practical to run
thousands of seconds of simulation while tuning. Keep them that way.

**Tunnelling is the failure that matters.** A pinball travels many times its own radius per frame —
at 2400 units/s and 60 fps that is 40 units against an 11-unit ball radius. Rather than full
continuous collision, `stepBall` caps the step size so the ball can never move more than a third of
its radius between tests, which makes discrete tests safe and costs nothing since there is one ball.
The speed cap is applied *after* collision response as well as before: bumper kicks and flipper
impulses are added during resolution, and clamping only beforehand let a ball caught between two
bumpers compound kick on kick to 6816 against a 3000 cap — fast enough to defeat the substep bound
and escape the table.

**THE GAP RULE, which the pinch scan enforces.** Every gap between two pieces of geometry must be
either flush or comfortably wider than a ball, never in between: at an in-between width the ball
wedges with both normals cancelling and sits there for the rest of the game. The drop-target bank
first stood 12 units off the right wall against a 22-unit ball, and the mission selector was a post
14 units off the orbit guide — both trapped the ball, and every alternative position for that post
pinched against a bumper instead, which is why the selector is now a rollover sensor with no
collision geometry at all. Related: with "downhill" always +y, a near-horizontal wall inside the
table is a shelf the ball can rest on forever, so there are none.

Both rules are checked mechanically rather than by eye — a stochastic wedge test that flies the ball
from random positions at random speeds with the flippers flapping, and a deterministic pairwise scan
of every surface. The wedge test spawns only in flood-filled reachable space: the table has sealed
voids by design (inside each closed kicker triangle, the apron beside the plunger lane), and dropping
a ball into one and calling it a wedge is a false alarm that costs an afternoon.

Every scoring feature is proven reachable from a flipper, because a table with a shot nobody can make
is a dead table — and the sweep varies *when* the flipper fires as well as where the ball sits, since
timing is how a pinball player aims. Fixing the fire frame tests one shot fifteen times instead of
fifteen shots, and it hid a broken orbit lane: with the mouth two hundred units too high, 0 of 84
shots could reach it, which quietly killed one of the four missions.

### The artwork

Two layers. Everything that never changes — felt, starfield, the wormhole rings, panels, lane
channels, chevrons, decals, chrome rails — is baked once into an offscreen canvas at the current
pixel density and blitted with a single `drawImage`; only what animates is drawn per frame. That is
what pays for artwork this dense: measured at 412x900 on a 2x display, the bake is 0.8 ms once per
resize and the p95 frame draw is 0.4 ms against a 16.7 ms budget.
