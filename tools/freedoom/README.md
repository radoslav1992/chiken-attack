# Freedoom, built for the browser

`public/freedoom/` runs [Freedoom: Phase 2](https://freedoom.github.io/) on
[Crispy Doom](https://github.com/fabiangreffrath/crispy-doom) 6.0 compiled to WebAssembly. This
directory is everything needed to rebuild the engine half of that. It is here for two reasons: so
the build can be repeated, and because the engine is under the GNU General Public License, which
means anyone given the binary is owed the source that made it.

| Thing | Where it comes from | Licence |
| --- | --- | --- |
| Engine source | `public/freedoom/source/crispy-doom_6.0.orig.tar.gz`, the upstream release | GPL-2.0 |
| Changes to it | `crispy-doom-6.0-web.patch`: four files, about forty lines | GPL-2.0-or-later |
| Browser layer | `web/`: video, input, sound, music, and a stand-in for the SDL2 headers | GPL-2.0-or-later |
| Game data | `public/freedoom/data/freedoom2.wad.gz`, Freedoom 0.13.0, unmodified | BSD-3-Clause |

None of it is id Software's game data, and none of id's levels, art or music are in this
repository. Freedoom is its own game, made to run on the same open-source engine.

## Rebuild

On Ubuntu 24.04:

```bash
sudo apt install emscripten                      # 3.1.6
mkdir /tmp/fd && cd /tmp/fd
tar xzf <repo>/public/freedoom/source/crispy-doom_6.0.orig.tar.gz
cd crispy-doom-crispy-doom-6.0
patch -p1 < <repo>/tools/freedoom/crispy-doom-6.0-web.patch
<repo>/tools/freedoom/build.sh . <repo>/public/freedoom/engine
```

That writes `freedoom.js` and `freedoom.wasm`. The game data is not built here; to refresh it,
take `freedoom2.wad` from a Freedoom release and `gzip -9 -n` it.

## How the port works

The engine is written against SDL2. There is no SDL2 in this build: the files that open a
window, read a keyboard or drive a mixer are left out, and `web/` supplies what they supplied.

- **`SDL.h` and friends** are a stand-in header. Most of the engine uses SDL only for integer
  types, byte swapping and a clock, so that is all the header provides.
- **`web_video.c`** converts the engine's 8-bit picture to RGBA through the palette and hands it
  to a canvas, then waits for the browser's next repaint.
- **`web_input.c`** receives key and mouse events from the page, already translated into the
  engine's own key numbers, and provides the clock.
- **`web_sound.c`** passes each sound effect to the page, which plays it with Web Audio.
- **`opl_web.c`** is a driver for the engine's music library. The music is FM synthesis on an
  emulated sound chip; the page asks for it a block of samples at a time.
- **`web_events.c`** tells the page when a game starts, a level ends or the player dies, which
  is what the arcade's score is made from.
- **`web_stubs.c`** is the handful of things with no meaning in a tab: joysticks, the text-mode
  exit screen, the network lobby.

Three build choices are worth knowing about before changing anything:

- **Asyncify.** The engine's main loop never returns, and a browser needs it to. Asyncify lets
  the loop pause in the middle (`js_wait_frame`, `SDL_Delay`) and carry on later, so the loop
  did not have to be rewritten.
- **`EMULATE_FUNCTION_POINTER_CASTS`.** The engine calls its per-frame "thinker" functions
  through one pointer type regardless of the arguments they take. Native code tolerates that;
  WebAssembly traps on it. Without this flag the game dies the moment a level loads.
- **`-Dmain=doom_main`.** Ubuntu's Emscripten 3.1.6 is paired with clang 15, and that pairing
  does not export a `main` that takes arguments. The engine's `main` is renamed and the page
  calls `web_main` instead.

One more, in the clock: time the tab spends hidden is subtracted (`Web_ForgetTime`). Otherwise
the engine wakes up owing itself every game tic it missed and plays them all at once.
