//
// Copyright(C) 1993-1996 Id Software, Inc.
// Copyright(C) 2005-2014 Simon Howard
// Copyright(C) 2014-2023 Fabian Greffrath
// Copyright(C) 2026 Beaver Games contributors
//
// Parts of this file are adapted from i_video.c in Crispy Doom.
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
//	Video for the browser build. Stands in for i_video.c.
//
//	The engine draws into an 8-bit buffer. Each frame that buffer is
//	turned into RGBA through the current palette and handed to a canvas;
//	the page scales the canvas. Then the frame waits for the browser's
//	next repaint, which is also where the engine gives the page its turn.
//

#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <emscripten.h>

#include "config.h"
#include "crispy.h"
#include "d_event.h"
#include "d_loop.h"
#include "deh_str.h"
#include "doomtype.h"
#include "i_input.h"
#include "i_joystick.h"
#include "i_system.h"
#include "i_timer.h"
#include "i_video.h"
#include "m_argv.h"
#include "m_config.h"
#include "m_misc.h"
#include "tables.h"
#include "v_diskicon.h"
#include "v_video.h"
#include "w_wad.h"
#include "z_zone.h"

int SCREENWIDTH, SCREENHEIGHT, SCREENHEIGHT_4_3;
int NONWIDEWIDTH;
int WIDESCREENDELTA;

// Kept so the config file round-trips; none of them does anything here.
int usemouse = 1;
int png_screenshots = 0;
char *video_driver = "";
char *window_position = "center";
int video_display = 0;
int window_width = 800;
int window_height = 600;
int fullscreen_width = 0, fullscreen_height = 0;
static int max_scaling_buffer_pixels = 16000000;
int fullscreen = false;
int aspect_ratio_correct = true;
int integer_scaling = false;
int vga_porch_flash = false;
int force_software_renderer = false;
static int startup_delay = 0;
static int grabmouse = true;

pixel_t *I_VideoBuffer = NULL;
boolean screensaver_mode = false;
boolean screenvisible = true;
int usegamma = 0;
unsigned int joywait = 0;
fixed_t fractionaltic;
byte **gamma2table = NULL;

static boolean initialized = false;
static boolean display_fps_dots;
static grabmouse_callback_t grabmouse_callback = NULL;

static uint32_t palette_rgba[256];
static byte palette_rgb[256][3];
static uint32_t *rgba = NULL;

// The page tells us the shape of the space it has, for widescreen rendering.
static int page_w = 16, page_h = 10;

EM_JS(void, js_present, (const uint32_t *pixels, int w, int h, int aspect_w, int aspect_h), {
    if (Module.webPresent) Module.webPresent(pixels, w, h, aspect_w, aspect_h);
});

// Suspends the engine until the next repaint. Everything that runs in the
// page while the game is going — input, audio, saving — happens in here.
EM_JS(void, js_wait_frame, (), {
    Asyncify.handleSleep(function (wake) {
        requestAnimationFrame(function () { wake(); });
    });
});

EM_JS(void, js_set_title, (const char *title), {
    if (Module.webTitle) Module.webTitle(UTF8ToString(title));
});

EMSCRIPTEN_KEEPALIVE
void web_set_page_shape(int w, int h)
{
    if (w > 0 && h > 0)
    {
        page_w = w;
        page_h = h;
    }
}

// True while the player is in a level and the mouse should steer.
EMSCRIPTEN_KEEPALIVE
int web_wants_mouse(void)
{
    return initialized && grabmouse && grabmouse_callback != NULL
        && grabmouse_callback();
}

void I_SetGrabMouseCallback(grabmouse_callback_t func)
{
    grabmouse_callback = func;
}

void I_DisplayFPSDots(boolean dots_on)
{
    display_fps_dots = dots_on;
}

void I_ShutdownGraphics(void)
{
    initialized = false;
}

void I_StartFrame(void)
{
}

void I_StartTic(void)
{
    if (!initialized)
    {
        return;
    }

    // Key and button events are posted straight from the page; only the
    // accumulated mouse movement has to be collected here.
    if (usemouse)
    {
        I_ReadMouse();
    }
}

void I_UpdateNoBlit(void)
{
}

void I_FinishUpdate(void)
{
    static int lasttic;
    int i, n;

    if (!initialized)
    {
        return;
    }

    if (display_fps_dots)
    {
        int tics;

        i = I_GetTime();
        tics = i - lasttic;
        lasttic = i;
        if (tics > 20) tics = 20;

        for (i = 0; i < tics * 4; i += 4)
            I_VideoBuffer[(SCREENHEIGHT - 1) * SCREENWIDTH + i] = 0xff;
        for (; i < 20 * 4; i += 4)
            I_VideoBuffer[(SCREENHEIGHT - 1) * SCREENWIDTH + i] = 0x0;
    }

    V_DrawDiskIcon();

    n = SCREENWIDTH * SCREENHEIGHT;
    for (i = 0; i < n; ++i)
    {
        rgba[i] = palette_rgba[I_VideoBuffer[i]];
    }

    // 320x200 was shown on a 4:3 screen, so its pixels are 1.2 times as tall
    // as they are wide. The canvas is told the shape to stretch to.
    js_present(rgba, SCREENWIDTH, SCREENHEIGHT, SCREENWIDTH,
               aspect_ratio_correct == 1 ? 6 * SCREENHEIGHT / 5 : SCREENHEIGHT);

    {
        // A repaint that takes a quarter of a second means the tab was
        // hidden: do not count that as time played. See Web_ForgetTime().
        extern void Web_ForgetTime(double ms);
        double before = emscripten_get_now();
        double waited;

        js_wait_frame();

        waited = emscripten_get_now() - before;
        if (waited > 250)
        {
            Web_ForgetTime(waited - 16);
        }
    }

    if (crispy->uncapped)
    {
        fractionaltic = I_GetFracRealTime();
    }

    V_RestoreDiskBackground();
}

void I_ReadScreen(pixel_t *scr)
{
    memcpy(scr, I_VideoBuffer, SCREENWIDTH * SCREENHEIGHT * sizeof(*scr));
}

void I_SetGammaTable(void)
{
    int i;

    gamma2table = malloc(9 * sizeof(*gamma2table));

    // five original gamma levels, and four halfway between them
    for (i = 0; i < 5; i++)
    {
        gamma2table[2 * i] = (byte *) gammatable[i];
    }

    for (i = 0; i < 4; i++)
    {
        int j;

        gamma2table[2 * i + 1] = malloc(256 * sizeof(**gamma2table));

        for (j = 0; j < 256; j++)
        {
            gamma2table[2 * i + 1][j] =
                (gamma2table[2 * i][j] + gamma2table[2 * i + 2][j]) / 2;
        }
    }
}

void I_SetPalette(byte *doompalette)
{
    int i;

    if (!gamma2table)
    {
        I_SetGammaTable();
    }

    for (i = 0; i < 256; ++i)
    {
        byte r = gamma2table[usegamma][*doompalette++];
        byte g = gamma2table[usegamma][*doompalette++];
        byte b = gamma2table[usegamma][*doompalette++];

        palette_rgb[i][0] = r;
        palette_rgb[i][1] = g;
        palette_rgb[i][2] = b;
        // canvas pixels are R, G, B, A in memory order
        palette_rgba[i] = 0xff000000u | ((uint32_t) b << 16)
                        | ((uint32_t) g << 8) | r;
    }
}

int I_GetPaletteIndex(int r, int g, int b)
{
    int best = 0, best_diff = INT_MAX;
    int i;

    for (i = 0; i < 256; ++i)
    {
        int dr = r - palette_rgb[i][0];
        int dg = g - palette_rgb[i][1];
        int db = b - palette_rgb[i][2];
        int diff = dr * dr + dg * dg + db * db;

        if (diff < best_diff)
        {
            best = i;
            best_diff = diff;
        }

        if (diff == 0)
        {
            break;
        }
    }

    return best;
}

void I_SetWindowTitle(const char *title)
{
    js_set_title(title);
}

void I_InitWindowTitle(void)
{
}

void I_RegisterWindowIcon(const unsigned int *icon, int width, int height)
{
}

void I_InitWindowIcon(void)
{
}

void I_GraphicsCheckCommandLine(void)
{
}

void I_CheckIsScreensaver(void)
{
}

void I_GetWindowPosition(int *x, int *y, int w, int h)
{
    *x = 0;
    *y = 0;
}

void I_EnableLoadingDisk(int xoffs, int yoffs)
{
    // No disk to wait for: the whole game is already in memory.
}

void I_BeginRead(void)
{
}

void I_GetScreenDimensions(void)
{
    int w = 16, h = 10;
    int ah;

    SCREENWIDTH = ORIGWIDTH << crispy->hires;
    SCREENHEIGHT = ORIGHEIGHT << crispy->hires;

    NONWIDEWIDTH = SCREENWIDTH;

    ah = (aspect_ratio_correct == 1) ? (6 * SCREENHEIGHT / 5) : SCREENHEIGHT;

    // only widen if the page really is wider than 4:3
    if (page_w * ah >= page_h * SCREENWIDTH)
    {
        w = page_w;
        h = page_h;
    }

    if (crispy->widescreen && aspect_ratio_correct == 1)
    {
        switch (crispy->widescreen)
        {
            case RATIO_16_10:
                w = 16;
                h = 10;
                break;
            case RATIO_16_9:
                w = 16;
                h = 9;
                break;
            case RATIO_21_9:
                w = 21;
                h = 9;
                break;
            default:
                break;
        }

        SCREENWIDTH = w * ah / h;
        SCREENWIDTH = (SCREENWIDTH + (crispy->hires ? 0 : 3)) & (int) ~3;
        SCREENWIDTH = MIN(SCREENWIDTH, MAXWIDTH);
    }

    WIDESCREENDELTA = ((SCREENWIDTH - NONWIDEWIDTH) >> crispy->hires) / 2;
}

static void AllocateBuffers(void)
{
    I_GetScreenDimensions();
    V_Init();

    free(I_VideoBuffer);
    free(rgba);
    I_VideoBuffer = calloc(MAXWIDTH * MAXHEIGHT, sizeof(*I_VideoBuffer));
    rgba = calloc(MAXWIDTH * MAXHEIGHT, sizeof(*rgba));

    if (I_VideoBuffer == NULL || rgba == NULL)
    {
        I_Error("Failed to allocate the screen buffers");
    }

    V_RestoreBuffer();
}

void I_InitGraphics(void)
{
    AllocateBuffers();
    I_SetPalette(W_CacheLumpName(DEH_String("PLAYPAL"), PU_CACHE));

    initialized = true;
    I_AtExit(I_ShutdownGraphics, true);
}

// Called when a display option changes in the menu.
void I_ReInitGraphics(int reinit)
{
    if (reinit & REINIT_FRAMEBUFFERS)
    {
        AllocateBuffers();
    }
}

// Screenshots: the palette first, then the indexed picture.
void I_RenderReadPixels(byte **data, int *w, int *h, int *p)
{
    byte *out = malloc(SCREENWIDTH * SCREENHEIGHT);

    memcpy(out, I_VideoBuffer, SCREENWIDTH * SCREENHEIGHT);
    *data = out;
    *w = SCREENWIDTH;
    *h = SCREENHEIGHT;
    *p = SCREENWIDTH;
}

void I_BindVideoVariables(void)
{
    M_BindIntVariable("use_mouse",                 &usemouse);
    M_BindIntVariable("fullscreen",                &fullscreen);
    M_BindIntVariable("video_display",             &video_display);
    M_BindIntVariable("aspect_ratio_correct",      &aspect_ratio_correct);
    M_BindIntVariable("integer_scaling",           &integer_scaling);
    M_BindIntVariable("vga_porch_flash",           &vga_porch_flash);
    M_BindIntVariable("startup_delay",             &startup_delay);
    M_BindIntVariable("fullscreen_width",          &fullscreen_width);
    M_BindIntVariable("fullscreen_height",         &fullscreen_height);
    M_BindIntVariable("force_software_renderer",   &force_software_renderer);
    M_BindIntVariable("max_scaling_buffer_pixels", &max_scaling_buffer_pixels);
    M_BindIntVariable("window_width",              &window_width);
    M_BindIntVariable("window_height",             &window_height);
    M_BindIntVariable("grabmouse",                 &grabmouse);
    M_BindStringVariable("video_driver",           &video_driver);
    M_BindStringVariable("window_position",        &window_position);
    M_BindIntVariable("usegamma",                  &usegamma);
    M_BindIntVariable("png_screenshots",           &png_screenshots);
}
