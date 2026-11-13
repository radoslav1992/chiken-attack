/*
 * A stand-in for SDL.h, for the browser build only.
 *
 * The engine is written against SDL2, which cannot be linked here. Most of it
 * uses SDL for three things — fixed-width types, byte swapping and a clock —
 * so this header supplies exactly those, and the files that drive a window,
 * a keyboard or a sound card (i_video.c, i_input.c, the SDL mixer modules) are
 * left out of the build and replaced by the web_*.c files beside this one.
 *
 * Copyright(C) 2026 Beaver Games contributors
 * This file is part of a port of Crispy Doom and is distributed under the GNU
 * General Public License, version 2 or (at your option) any later version.
 */

#ifndef WEB_SDL_SHIM_H
#define WEB_SDL_SHIM_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef uint8_t Uint8;
typedef uint16_t Uint16;
typedef uint32_t Uint32;
typedef uint64_t Uint64;
typedef int16_t Sint16;
typedef int32_t Sint32;

#define SDL_LIL_ENDIAN 1234
#define SDL_BIG_ENDIAN 4321
#define SDL_BYTEORDER SDL_LIL_ENDIAN /* WebAssembly is little-endian */

#define SDL_Swap16(x) __builtin_bswap16(x)
#define SDL_Swap32(x) __builtin_bswap32(x)
#define SDL_SwapLE16(x) (x)
#define SDL_SwapLE32(x) (x)
#define SDL_SwapBE16(x) __builtin_bswap16(x)
#define SDL_SwapBE32(x) __builtin_bswap32(x)

#define SDL_qsort qsort
#define SDL_free free

#define SDL_VERSION_ATLEAST(a, b, c) 1

typedef struct
{
    Uint8 major, minor, patch;
} SDL_version;

static inline void SDL_GetVersion(SDL_version *v)
{
    v->major = 2;
    v->minor = 0;
    v->patch = 0;
}

#define SDL_GetPlatform() "Web"
#define SDL_INIT_TIMER 0
#define SDL_Init(flags) 0
#define SDL_Quit() ((void) 0)
#define SDL_SetHint(name, value) ((void) 0)
#define SDL_HINT_WINDOWS_DISABLE_THREAD_NAMING ""
#define SDL_MESSAGEBOX_ERROR 0
#define SDL_ShowSimpleMessageBox(flags, title, message, window) ((void) 0)

Uint32 SDL_GetTicks(void);
void SDL_Delay(Uint32 ms);
Uint64 SDL_GetPerformanceCounter(void);
Uint64 SDL_GetPerformanceFrequency(void);
char *SDL_GetPrefPath(const char *org, const char *app);

#define SDL_GetCurrentAudioDriver() "Web Audio"

/* Only ever passed by pointer, in prototypes the web build does not call. */
typedef struct SDL_Event SDL_Event;

#endif
