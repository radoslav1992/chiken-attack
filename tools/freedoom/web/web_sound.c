//
// Copyright(C) 2026 Beaver Games contributors
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// DESCRIPTION:
//	Sound effects for the browser build: a sound module that hands each
//	effect to the page, which plays it through Web Audio.
//
//	The engine already decides which of its eight channels a sound goes
//	on, how loud it is and where it sits between the speakers. All that is
//	left to do is pass the lump along; the page decodes it once and keeps
//	the result.
//

#include <stdio.h>
#include <emscripten.h>

#include "config.h"
#include "deh_str.h"
#include "doomtype.h"
#include "i_sound.h"
#include "m_misc.h"
#include "w_wad.h"
#include "web_events.h"
#include "z_zone.h"

static boolean use_sfx_prefix;

EM_JS(void, js_sfx_start, (int channel, int lump, const unsigned char *data, int len, int vol, int sep), {
    if (Module.webSfxStart) Module.webSfxStart(channel, lump, data, len, vol, sep);
});

EM_JS(void, js_sfx_params, (int channel, int vol, int sep), {
    if (Module.webSfxParams) Module.webSfxParams(channel, vol, sep);
});

EM_JS(void, js_sfx_stop, (int channel), {
    if (Module.webSfxStop) Module.webSfxStop(channel);
});

EM_JS(int, js_sfx_playing, (int channel), {
    return Module.webSfxPlaying && Module.webSfxPlaying(channel) ? 1 : 0;
});

static boolean Web_InitSound(boolean _use_sfx_prefix)
{
    use_sfx_prefix = _use_sfx_prefix;
    return true;
}

static void Web_ShutdownSound(void)
{
    int i;

    for (i = 0; i < 16; ++i)
    {
        js_sfx_stop(i);
    }
}

static int Web_GetSfxLumpNum(sfxinfo_t *sfx)
{
    char name[9];

    if (sfx->link != NULL)
    {
        sfx = sfx->link;
    }

    M_snprintf(name, sizeof(name), use_sfx_prefix ? "ds%s" : "%s",
               DEH_String(sfx->name));

    return W_CheckNumForName(name);
}

static void Web_UpdateSound(void)
{
}

static void Web_UpdateSoundParams(int channel, int vol, int sep)
{
    js_sfx_params(channel, vol, sep);
}

static int Web_StartSound(sfxinfo_t *sfxinfo, int channel, int vol, int sep, int pitch)
{
    int lump = sfxinfo->lumpnum;
    int len;

    if (lump < 0)
    {
        return -1;
    }

    // Most sound effects come in their own pack, after the game has started.
    // Until it lands, a sound is skipped rather than waited for.
    if (!Web_DataReady(lumpinfo[lump]->position))
    {
        return -1;
    }

    len = W_LumpLength(lump);

    // eight bytes of header, and a sound needs at least some samples after it
    if (len <= 8)
    {
        return -1;
    }

    js_sfx_start(channel, lump, W_CacheLumpNum(lump, PU_CACHE), len, vol, sep);

    return channel;
}

static void Web_StopSound(int channel)
{
    js_sfx_stop(channel);
}

static boolean Web_SoundIsPlaying(int channel)
{
    return js_sfx_playing(channel) != 0;
}

static void Web_PrecacheSounds(sfxinfo_t *sounds, int num_sounds)
{
}

static const snddevice_t sound_web_devices[] =
{
    SNDDEVICE_SB,
    SNDDEVICE_PAS,
    SNDDEVICE_GUS,
    SNDDEVICE_WAVEBLASTER,
    SNDDEVICE_SOUNDCANVAS,
    SNDDEVICE_AWE32,
};

const sound_module_t sound_web_module =
{
    sound_web_devices,
    arrlen(sound_web_devices),
    Web_InitSound,
    Web_ShutdownSound,
    Web_GetSfxLumpNum,
    Web_UpdateSound,
    Web_UpdateSoundParams,
    Web_StartSound,
    Web_StopSound,
    Web_SoundIsPlaying,
    Web_PrecacheSounds,
};

// Settings the SDL sound module would have owned. They are still read from
// and written to the config file, so they have to exist.
int use_libsamplerate = 0;
float libsamplerate_scale = 0.65f;
char *timidity_cfg_path = "";

// MIDI through Timidity is an SDL_mixer feature; music here is OPL only.
void I_InitTimidityConfig(void)
{
}
