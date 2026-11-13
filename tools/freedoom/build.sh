#!/bin/sh
# Builds the browser port of Crispy Doom 6.0 that public/freedoom/ runs.
#
#   tools/freedoom/build.sh <patched-crispy-doom-source> <output-dir>
#
# Needs Emscripten 3.1.6 (Ubuntu 24.04: apt install emscripten). README.md in
# this directory has the full steps, including where the source comes from.
set -e
SRC=$(cd "$1" && pwd)
OUT=$(mkdir -p "$2" && cd "$2" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
OBJ="${OBJ:-${TMPDIR:-/tmp}/freedoom-web-obj}"
mkdir -p "$OBJ"

# Engine files that talk to SDL's window, input, mixer or network are left out;
# web/*.c takes their place.
SKIP="i_video.c i_videohr.c i_input.c i_joystick.c i_endoom.c i_cdmus.c i_flmusic.c i_winmusic.c
      i_sdlsound.c i_sdlmusic.c i_pcsound.c net_gui.c net_dedicated.c d_dedicated.c
      w_file_win32.c w_file_posix.c z_native.c"

FILES=""
for f in "$SRC"/src/*.c "$SRC"/src/doom/*.c "$SRC"/opl/opl.c "$SRC"/opl/opl3.c "$SRC"/opl/opl_queue.c "$HERE"/web/*.c "$HERE"/lzma/LzmaDec.c; do
  base=$(basename "$f")
  case " $(echo $SKIP) " in *" $base "*) continue ;; esac
  FILES="$FILES $f"
done

# -Dmain=doom_main: this Emscripten (3.1.6 with clang 15) does not export a
# main() that takes arguments, so the engine's is renamed and web_input.c
# exports web_main() to call it.
CFLAGS="-O2 -DHAVE_CONFIG_H -Dmain=doom_main -I$HERE/web -I$HERE/lzma -I$SRC/src -I$SRC/src/doom -I$SRC/opl -I$SRC/pcsound
        -Wno-unused-result -Wno-pointer-sign -Wno-parentheses -Wno-unknown-warning-option"

export OBJ CFLAGS
printf "%s\n" $FILES | xargs -P "$(nproc)" -I{} sh -c '
  f="{}"; o="$OBJ/$(echo "$f" | sed "s#[/.]#_#g").o"
  if [ ! -f "$o" ] || [ "$f" -nt "$o" ]; then emcc $CFLAGS -c "$f" -o "$o" 2>"$o.log" || { echo "FAILED $f"; exit 1; }; fi'

if ls "$OBJ"/*.log >/dev/null 2>&1 && grep -l "error:" "$OBJ"/*.log >/dev/null 2>&1; then
  echo "compile errors:"; grep -h "error:" "$OBJ"/*.log | sed "s#$SRC/##; s#$HERE/##" | sort | uniq | head -60
  exit 1
fi

# EMULATE_FUNCTION_POINTER_CASTS: the engine calls its "thinker" and sprite
# action functions through one pointer type whatever arguments they really
# take. Native code shrugs; WebAssembly traps. This makes it shrug too.
emcc -O2 "$OBJ"/*.o -o "$OUT/freedoom.js" \
  -sASYNCIFY -sASYNCIFY_STACK_SIZE=65536 \
  -sASYNCIFY_IMPORTS='["js_wait_frame","js_ensure_level"]' \
  -sDYNAMIC_EXECUTION=0 \
  -sEMULATE_FUNCTION_POINTER_CASTS=1 \
  -sINITIAL_MEMORY=134217728 -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_RUNTIME_METHODS='["FS","IDBFS","UTF8ToString","stringToUTF8","lengthBytesUTF8","addRunDependency","removeRunDependency"]' \
  -sEXPORTED_FUNCTIONS='["_web_main","_malloc","_free"]' \
  -sFORCE_FILESYSTEM=1 -lidbfs.js \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sENVIRONMENT=web
ls -la "$OUT"
