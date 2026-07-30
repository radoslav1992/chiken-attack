# Chicken Attack

A mobile-first, installable PWA arcade shooter in the spirit of *Chicken Invaders*: waves of
invading space poultry, drumsticks to hoover up, nine upgradeable weapons and a boss every fifth
wave. One landing page, one **Start Game** button, no build step, fully playable offline — and a run
interrupted by a closed tab is offered back to you the next time you open it.

Everything — sprites, sound effects, music and icons — is generated procedurally at runtime
(Canvas2D + Web Audio), so the whole game is a handful of text files and five small PNGs.

## Play it

Any static host works — the deployable site is the `public/` directory.

```bash
npm run serve        # python3 -m http.server 8000 --directory public
# then open http://localhost:8000
```

## Deploy to Cloudflare

The repo is configured for **Cloudflare Workers static assets** (`wrangler.jsonc`
points at `public/`). There is no build step, so a deploy is just an upload.

```bash
npm install          # once, for wrangler
npm run dev          # local preview at http://localhost:8787 with _headers applied
npm run deploy       # wrangler deploy
```

The first `npm run deploy` prompts for a browser login and creates a
`chicken-attack.<your-subdomain>.workers.dev` site; add a custom domain from the
Worker's dashboard **Settings → Domains & Routes** when you want one. Rename the
project by editing `name` in `wrangler.jsonc`.

**Cloudflare Pages** works equally well if you prefer it:

```bash
npm run deploy:pages           # wrangler pages deploy public
```

Or connect the repository in the Pages dashboard and use:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |

**CI deploys.** `.github/workflows/deploy-cloudflare.yml` deploys on every push
to `main` once two repository secrets exist: `CLOUDFLARE_API_TOKEN` (use the
*Edit Cloudflare Workers* template) and `CLOUDFLARE_ACCOUNT_ID`. Without them the
job logs a notice and passes, so forks never see red builds.

### What the Cloudflare config does

- `public/_headers` sets the security headers (including a strict CSP with no
  `unsafe-inline`) and the cache policy. Filenames are not content-hashed, so
  HTML, JS and CSS are served `must-revalidate` and only icons get a long TTL —
  otherwise a redeploy would leave players on a half-updated set of modules.
  Offline play comes from the service worker, not from browser cache lifetimes.
- `not_found_handling: "404-page"` serves `public/404.html`. An SPA fallback
  would be wrong here: the game has no client-side routing and `index.html`
  links its assets relatively, so a shell served at `/some/deep/path` would
  fetch `/some/deep/css/styles.css` and break.
- Offline, the service worker answers navigations from cache; a deep link whose
  origin is unreachable is redirected to the app root so relative URLs resolve.

After changing any file under `public/`, bump `VERSION` in `public/sw.js` so
installed clients pick the new bundle up on their next visit.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Fly | drag anywhere (relative) or follow-finger, switchable in Settings | arrows / WASD | left stick |
| Shoot | auto-fire (default) or hold to fire | Space | A |
| Missile | missile button, or tap with a second finger | X / Z / Ctrl | B |
| Pause | pause button | P / Esc | Start |

## Features

**Modes & progression**

- Three difficulties — Rookie (five ships, gentle eggs), Veteran, Superstar (two ships, ×1.6 score)
  — picked on the landing page and recorded with each high score.
- Runs autosave at every wave boundary: reopen the game and **Continue** picks up the wave, score,
  ships, weapon, power level, missiles and drumsticks. Works offline too.
- Endless escalating waves with a per-wave curve (health, speed, egg rate, egg speed) on top of the
  difficulty multipliers.
- Drumstick economy: 100 drumsticks earn an extra life. Combo multiplier up to ×5, wave-clear
  bonuses for accuracy and remaining lives, top-10 local table with name entry and lifetime stats.
- Timed power-ups (see below) drop alongside the permanent upgrades. Buffs are deliberately not
  part of the autosave — a resumed run restarts the wave without them.

**Combat**

- Nine weapons with distinct behaviour and 10 power levels each: Ion Blaster, Neutron Gun,
  Boron Railgun (piercing), Vulcan Chaingun, Positron Stream, Utensil Poker (spread), Lightning
  Fryer (chains between chickens), Plasma Rifle (splash) and Corn Shotgun.
- Homing missiles with splash damage, limited stock, restocked by gifts.
- Losing a ship costs two weapon levels — same sting as the original.

**Enemies**

- Four chicken breeds (regular, brown, armoured, chicks) with health bars on the tough ones.
- Six flight behaviours: formation slots, orbiting carousels, sine-wave strafing runs, dive
  bombers that loop back around, falling chicken storms and chicks that chase the ship.
- Nine wave archetypes on rotation, including ASCII-art formations (heart, skull, arrow, egg,
  star, wings, invader), asteroid belts with rocks that shatter into shards, and bonus UFOs that
  always drop a gift.
- Every seventh non-boss wave is a **feast**: drumsticks and gifts rain down, nothing shoots back.
- Gifts: weapon swap, +power, missiles, shield and extra life.

**Power-ups**

Timed boosts drop as labelled gift boxes and show a countdown ring in the HUD (glyph, plus the
seconds remaining once under ten). Collecting one you already have refreshes its timer.

| Power-up | Effect | Duration |
| --- | --- | --- |
| Wing Drones | Two escort drones fire your current weapon, a little slower and one power level down | 22 s |
| Overdrive | Weapon cooldown cut to 55% — measured at ~1.7x the shot rate | 12 s |
| Drumstick Magnet | Food and gifts home in from across the screen | 16 s |
| Golden Egg | Doubles every point scored, on top of the combo and difficulty multipliers | 20 s |
| Time Warp | Chickens, eggs and formations run at 45% speed; your ship and bullets do not | 9 s |
| Pressure Cooker | Instant: scrambles every egg in flight and damages everything on screen (bosses take 55%) | — |

**Bosses**

Two archetypes alternate every fifth wave, both with three escalating phases and a health bar:

- **The giant hen** — crowned, with egg volleys, radial egg rings, sweeping bombing runs, charges
  that bounce off the walls, ground stomps and chick summons.
- **The chicken mothership** — a saucer with a pilot hen in the dome that fires a telegraphed
  cutting beam (dashed guide first, then a sweeping column), opens launch bays to disgorge escorts,
  lobs spiralling plasma yolks, drops walls of eggs with a single gap and scatters slow mines.

Twelve named bosses in total, scaling with the wave.

**Presentation & platform**

- Procedural sprites re-rendered per device pixel ratio, parallax starfield with nebula clouds,
  particles, feathers, shockwaves, screen shake, hit flashes and slow-motion death.
- Synthesised sound effects plus a step-sequenced soundtrack that switches to a faster, meaner
  variant during boss fights.
- Portrait-first layout, safe-area aware; wide screens (landscape, tablet, desktop) letterbox to a
  centred playfield with the HUD hugging its edge.
- Haptics, pause on tab switch (with a 3-2-1 countdown on resume so nobody unpauses into an egg),
  settings persisted to `localStorage`, PWA install prompt, offline service worker.
- Respects `prefers-reduced-motion` — no screen shake, no slow-motion death, dimmed flashes — plus
  a manual screen-shake toggle in settings.
- Gradients for bullets, pickups and boss lights are cached in local space rather than rebuilt per
  object per frame; that alone lifted the worst-case wave from ~20 fps to a steady 60.

## Layout

```
public/                    the deployable site — nothing else is uploaded
  index.html               landing page + overlays (menu, how-to, scores, settings, pause, results)
  404.html                 branded not-found page
  _headers                 Cloudflare security + cache headers
  manifest.webmanifest     PWA manifest
  sw.js                    offline cache
  css/styles.css           mobile-first shell
  icons/                   generated PNG icon set
  js/main.js               boot, screen routing, settings, install prompt
  js/game.js               loop, state machine, spawning, collisions, rendering
  js/player.js             ship movement, weapons, pickups, death
  js/enemies.js            chickens, asteroids, UFOs, bosses
  js/waves.js              formations, wave archetypes, difficulty curve
  js/weapons.js            weapon table + projectile rendering
  js/powerups.js           timed power-up table and tuning constants
  js/effects.js            pooled particles, shockwaves, floating text
  js/hud.js                in-canvas HUD, boss bar, banners
  js/art.js                procedural sprite pre-rendering + starfield
  js/audio.js              Web Audio sound effects and music
  js/input.js              touch / mouse / keyboard / gamepad
  js/storage.js            settings + high scores
  js/util.js               math, pooling, formatting
wrangler.jsonc             Cloudflare deploy config
tools/make-icons.mjs       regenerates public/icons (dependency-free PNG encoder)
```

Regenerate the icon set after changing the artwork:

```bash
npm run icons
```

## Notes

Scores and settings are stored locally in the browser; there is no backend and nothing leaves the
device. `window.__game` is exposed for debugging from the console.
