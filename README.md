# Chicken Attack

A mobile-first, installable PWA arcade shooter in the spirit of *Chicken Invaders*: waves of
invading space poultry, drumsticks to hoover up, nine upgradeable weapons and a boss hen every
fifth wave. One landing page, one **Start Game** button, no build step, fully playable offline.

Everything — sprites, sound effects, music and icons — is generated procedurally at runtime
(Canvas2D + Web Audio), so the whole game is a handful of text files and five small PNGs.

## Play it

Any static host works. Locally:

```bash
python3 -m http.server 8000      # or: npx serve .
# then open http://localhost:8000
```

For GitHub Pages, enable Pages on the branch root — `index.html`, `manifest.webmanifest` and
`sw.js` all use relative paths, so it works from a subdirectory too.

Installing: open the site on a phone and use *Add to Home Screen*, or press **Install App** on the
landing page where the browser supports it. After the first load the service worker keeps the game
runnable with no network.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Fly | drag anywhere (relative) or follow-finger, switchable in Settings | arrows / WASD | left stick |
| Shoot | auto-fire (default) or hold to fire | Space | A |
| Missile | missile button, or tap with a second finger | X / Z / Ctrl | B |
| Pause | pause button | P / Esc | Start |

## Features

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
- Boss hen every fifth wave: crowned, phase-based (three phases with a health bar), with egg
  volleys, radial egg rings, sweeping bombing runs, charges, ground stomps, feather storms and
  chick summons. Six named bosses on rotation, scaling with the wave.

**Progression**

- Endless escalating waves with a per-wave difficulty curve (health, speed, egg rate, egg speed).
- Drumstick economy: 100 drumsticks earn an extra life.
- Gifts: weapon swap, +power, missiles, shield and extra life.
- Combo multiplier up to ×5, wave-clear bonuses for accuracy and remaining lives, top-10 local
  high-score table.

**Presentation & platform**

- Procedural sprites re-rendered per device pixel ratio, parallax starfield with nebula clouds,
  particles, feathers, shockwaves, screen shake, hit flashes and slow-motion death.
- Synthesised sound effects plus a step-sequenced soundtrack that switches to a faster, meaner
  variant during boss fights.
- Portrait-first layout, safe-area aware; wide screens (landscape, tablet, desktop) letterbox to a
  centred playfield with the HUD hugging its edge.
- Haptics, pause on tab switch, settings persisted to `localStorage`, PWA install prompt, offline
  service worker.

## Layout

```
index.html                 landing page + overlays (menu, how-to, scores, settings, pause, results)
css/styles.css             mobile-first shell
js/main.js                 boot, screen routing, settings, install prompt
js/game.js                 loop, state machine, spawning, collisions, rendering
js/player.js               ship movement, weapons, pickups, death
js/enemies.js              chickens, asteroids, UFOs, bosses
js/waves.js                formations, wave archetypes, difficulty curve
js/weapons.js              weapon table + projectile rendering
js/effects.js              pooled particles, shockwaves, floating text
js/hud.js                  in-canvas HUD, boss bar, banners
js/art.js                  procedural sprite pre-rendering + starfield
js/audio.js                Web Audio sound effects and music
js/input.js                touch / mouse / keyboard / gamepad
js/storage.js              settings + high scores
js/util.js                 math, pooling, formatting
sw.js                      offline cache
tools/make-icons.mjs       regenerates icons/ (dependency-free PNG encoder)
```

Regenerate the icon set after changing the artwork:

```bash
node tools/make-icons.mjs
```

## Notes

Scores and settings are stored locally in the browser; there is no backend and nothing leaves the
device. `window.__game` is exposed for debugging from the console.
