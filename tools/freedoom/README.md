# Freedoom, built for the browser

`public/freedoom/` runs [Freedoom: Phase 2](https://freedoom.github.io/) on
[Crispy Doom](https://github.com/fabiangreffrath/crispy-doom) 6.0 compiled to WebAssembly. This
directory is everything needed to rebuild the engine half of that. It is here for two reasons: so
the build can be repeated, and because the engine is under the GNU General Public License, which
means anyone given the binary is owed the source that made it.

| Thing | Where it comes from | Licence |
| --- | --- | --- |
| Engine source | `public/freedoom/source/crispy-doom_6.0.orig.tar.gz`, the upstream release | GPL-2.0 |
| Changes to it | `crispy-doom-6.0-web.patch`: seven files, about a hundred lines | GPL-2.0-or-later |
| Browser layer | `web/`: video, input, sound, music, on-demand data, and a stand-in for the SDL2 headers | GPL-2.0-or-later |
| LZMA decoder | `lzma/`: `LzmaDec.c` from the LZMA SDK, unmodified | Public domain |
| Game data | `public/freedoom/data/*.lzma`, Freedoom 0.13.0 cut into packs, contents unmodified | BSD-3-Clause |

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

That writes `freedoom.js` and `freedoom.wasm`.

The game data is separate. `make-packs.py` cuts a `freedoom2.wad` into the packs the page
downloads, and can put them back together:

```bash
tools/freedoom/make-packs.py build path/to/freedoom2.wad   # writes data/*.lzma and packs.json
tools/freedoom/make-packs.py verify                        # rebuilds the WAD, checks its hash
tools/freedoom/make-packs.py unpack /tmp/freedoom2.wad     # the same, and keeps the file
```

It needs Python 3 and the engine source tarball, from which it reads the lists of animated
textures and switches.

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
- **`web_wad.c`** is the game data arriving in pieces; see the next section.
- **`web_events.c`** tells the page when a game starts, a level ends or the player dies, which
  is what the arcade's score is made from.
- **`web_stubs.c`** is the handful of things with no meaning in a tab: joysticks, the text-mode
  exit screen, the network lobby.

## The game data arrives in packs

The whole game is 29 MB: 11 MB gzipped, and at first none of it was playable until all of it
had downloaded. Now the title screen appears after 1.9 MB and the rest follows while the player
is busy. Three things make that work.

**The file is cut by need, not by position.** `make-packs.py` sorts every lump into a pack:

| Pack | Holds | Size |
| --- | --- | --- |
| `core` | sprites, floors, music, menus, fonts, the menu's own sounds, the WAD header and directory | 1.9 MB |
| `sfx` | the other sound effects | 1.3 MB |
| `m01` … `m32` | each level's map, plus the wall art no earlier level needed | 0.02–0.5 MB each |
| `extra` | wall art no level uses | 0.7 MB |

All 35 together are 8.4 MB, against 10.9 MB for the single gzip file: LZMA instead of gzip.
`packs.json` records, for every stretch of the original file, which pack it is in and where, and
for every level, which packs it needs. Put back together in that order the packs are the original
file exactly; `make-packs.py verify` and the test suite both check the hash.

**The engine reads from the packs as if they were the file.** `web_wad.c` is a file class for the
engine's WAD layer: the engine asks for bytes at an offset, and it answers from whichever pack
holds them. Before a level loads, `P_SetupLevel` calls `Web_EnsureLevel`, which waits (the page
stays responsive, and the game clock does not run) until that level's packs are in.

**Two engine habits had to change, or nothing could be deferred.**

- At startup the engine built its texture lookup tables for all 1,000-odd textures, which means
  reading every wall patch in the game. `r_data.c` now builds each table the first time its
  texture is asked for. This is the change that makes the level packs worth having.
- The title screen plays recorded demos, each on a different level. Fetching three levels so the
  menu has something moving behind it is a poor trade, so the title and credit pages just cycle.

**When the packer is wrong, the game stutters; it does not crash.** Which wall art a level needs
is worked out from its map, plus the frames of any animated texture and the other face of any
switch, plus texture number 0 (the engine gives it to every wall that has none, and so loads it
with every level). If the engine still reads something that has not arrived, it is in the middle
of drawing a frame and cannot wait politely, so the page fetches that one pack on the spot with a
blocking request and logs a warning. `web_wad_misses()` counts these. Loading each of the 32
levels in turn on a throttled connection, with `extra` held back, produced none.

Sound effects are the exception: a sound whose pack has not landed is skipped rather than
fetched, because a moment of silence beats a moment of freeze.

## Build choices

Three are worth knowing about before changing anything:

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
