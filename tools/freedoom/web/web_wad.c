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
//	The game data, delivered a piece at a time.
//
//	The engine believes it has opened one 29 MB WAD file. It has not.
//	The file has been cut into packs (tools/freedoom/make-packs.py): a
//	core that every level needs, one pack per level, the sound effects,
//	and the leftovers. The page downloads the core, starts the game, and
//	fetches the rest behind it.
//
//	This file is the pretence. It keeps a table saying which pack holds
//	each stretch of the original file, and answers the engine's reads
//	out of whichever packs have arrived. Two things cover the gap:
//
//	  Web_EnsureLevel()  called before a level loads; waits, with the
//	                     page still alive, until that level's packs are in
//	  a miss             a read of something not yet here (a texture the
//	                     packer did not expect the level to need). The
//	                     page fetches that one pack on the spot. It costs
//	                     a stutter, never a crash.
//
//	Packs are LZMA streams; the decoder (lzma/LzmaDec.c, public domain,
//	from the LZMA SDK) is linked in here because browsers only unpack
//	gzip by themselves, and LZMA makes the download a quarter smaller.
//

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "LzmaDec.h"

#include "config.h"
#include "doomtype.h"
#include "m_misc.h"
#include "w_file.h"
#include "z_zone.h"

#define WEB_WAD_PATH "/freedoom2.wad"

typedef struct
{
    uint32_t pos;       // where this stretch starts in the original file
    uint32_t size;
    uint32_t pack;      // which pack holds it
    uint32_t offset;    // and where in that pack
} range_t;

static range_t *ranges = NULL;
static int num_ranges = 0;

static byte **pack_data = NULL;
static byte *pack_ready = NULL;
static int num_packs = 0;

static uint32_t wad_length = 0;
static int misses = 0;
static uint32_t last_miss = 0;

extern void Web_ForgetTime(double ms);

// --- called from the page -----------------------------------------------------

// `table` is num_ranges rows of pos, size, pack, offset, sorted by pos.
EMSCRIPTEN_KEEPALIVE
void web_wad_init(uint32_t length, int packs, int count, const uint32_t *table)
{
    wad_length = length;
    num_packs = packs;
    num_ranges = count;

    ranges = malloc(count * sizeof(*ranges));
    memcpy(ranges, table, count * sizeof(*ranges));
    pack_data = calloc(packs, sizeof(*pack_data));
    pack_ready = calloc(packs, 1);
}

// Room for a pack's unpacked bytes. The page decodes straight into it.
EMSCRIPTEN_KEEPALIVE
byte *web_wad_alloc(int pack, uint32_t size)
{
    if (pack < 0 || pack >= num_packs)
    {
        return NULL;
    }

    if (pack_data[pack] == NULL)
    {
        pack_data[pack] = malloc(size);
    }

    return pack_data[pack];
}

EMSCRIPTEN_KEEPALIVE
void web_wad_ready(int pack)
{
    if (pack >= 0 && pack < num_packs && pack_data[pack] != NULL)
    {
        pack_ready[pack] = 1;
    }
}

EMSCRIPTEN_KEEPALIVE
int web_wad_is_ready(int pack)
{
    return pack >= 0 && pack < num_packs && pack_ready[pack];
}

// How many reads had to stop and fetch. The tests watch this number.
EMSCRIPTEN_KEEPALIVE
int web_wad_misses(void)
{
    return misses;
}

static void *LzmaAlloc(ISzAllocPtr p, size_t size)
{
    return malloc(size);
}

static void LzmaFree(ISzAllocPtr p, void *address)
{
    free(address);
}

// Unpacks one ".lzma" stream (5 bytes of properties, 8 of length, then the
// data) into `dst`. Returns 0 when exactly dst_len bytes came out.
EMSCRIPTEN_KEEPALIVE
int web_lzma_decode(const byte *src, uint32_t src_len, byte *dst, uint32_t dst_len)
{
    static const ISzAlloc alloc = { LzmaAlloc, LzmaFree };
    SizeT out_len = dst_len;
    SizeT in_len;
    ELzmaStatus status;
    SRes res;

    if (src_len < 13 || dst == NULL)
    {
        return 1;
    }

    in_len = src_len - 13;
    res = LzmaDecode(dst, &out_len, src + 13, &in_len, src, 5,
                     LZMA_FINISH_END, &status, &alloc);

    return (res == SZ_OK && out_len == dst_len) ? 0 : 1;
}

// Where in the original file the most recent miss was, so a test (or a
// curious person with the console open) can name the lump responsible.
EMSCRIPTEN_KEEPALIVE
uint32_t web_wad_last_miss(void)
{
    return last_miss;
}

// --- lookups ------------------------------------------------------------------

static const range_t *FindRange(uint32_t offset)
{
    int lo = 0, hi = num_ranges - 1;

    while (lo <= hi)
    {
        int mid = (lo + hi) / 2;
        const range_t *r = &ranges[mid];

        if (offset < r->pos)
        {
            hi = mid - 1;
        }
        else if (offset >= r->pos + r->size)
        {
            lo = mid + 1;
        }
        else
        {
            return r;
        }
    }

    return NULL;
}

// Is the data at this file position here yet? Sound effects ask first and
// stay silent rather than stall the game for a noise.
boolean Web_DataReady(uint32_t position)
{
    const range_t *r;

    if (ranges == NULL)
    {
        return true;
    }

    r = FindRange(position);

    return r != NULL && pack_ready[r->pack];
}

EM_JS(void, js_pack_sync, (int pack), {
    if (Module.webPackSync) Module.webPackSync(pack);
});

EM_JS(void, js_ensure_level, (int map), {
    Asyncify.handleSleep(function (wake) {
        if (Module.webEnsureLevel) Module.webEnsureLevel(map, wake);
        else wake();
    });
});

// Waits until everything level `map` is known to need has arrived. The
// page keeps running while it does; the game clock does not.
void Web_EnsureLevel(int map)
{
    double before;
    double waited;

    if (ranges == NULL)
    {
        return;
    }

    before = emscripten_get_now();
    js_ensure_level(map);
    waited = emscripten_get_now() - before;

    if (waited > 30)
    {
        Web_ForgetTime(waited);
    }
}

// --- the file class the engine sees ---------------------------------------------

extern wad_file_class_t web_wad_file;

static wad_file_t *W_Web_OpenFile(const char *path)
{
    wad_file_t *result;

    if (ranges == NULL || strcmp(path, WEB_WAD_PATH) != 0)
    {
        return NULL;    // an ordinary file: leave it to the normal reader
    }

    result = Z_Malloc(sizeof(wad_file_t), PU_STATIC, 0);
    result->file_class = &web_wad_file;
    result->mapped = NULL;
    result->length = wad_length;
    result->path = M_StringDuplicate(path);

    return result;
}

static void W_Web_CloseFile(wad_file_t *wad)
{
    Z_Free(wad);
}

static size_t W_Web_Read(wad_file_t *wad, unsigned int offset,
                         void *buffer, size_t buffer_len)
{
    byte *out = buffer;
    size_t done = 0;

    while (done < buffer_len)
    {
        uint32_t at = offset + done;
        const range_t *r = FindRange(at);
        size_t n;

        if (r == NULL)
        {
            break;      // past the end, or in padding nothing should read
        }

        if (!pack_ready[r->pack])
        {
            ++misses;
            last_miss = r->pos;
            js_pack_sync(r->pack);

            if (!pack_ready[r->pack])
            {
                break;  // offline and never cached: the engine reports it
            }
        }

        n = r->pos + r->size - at;
        if (n > buffer_len - done)
        {
            n = buffer_len - done;
        }

        memcpy(out + done, pack_data[r->pack] + r->offset + (at - r->pos), n);
        done += n;
    }

    return done;
}

wad_file_class_t web_wad_file =
{
    W_Web_OpenFile,
    W_Web_CloseFile,
    W_Web_Read,
};
