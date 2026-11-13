//
// Copyright(C) 1993-1996 Id Software, Inc.
// Copyright(C) 2005-2014 Simon Howard
// Copyright(C) 2014-2023 Fabian Greffrath
// Copyright(C) 2026 Beaver Games contributors
//
// Parts of this file are adapted from i_input.c and i_timer.c in Crispy Doom.
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
//	Keyboard, mouse and clock for the browser build. Stands in for
//	i_input.c, i_joystick.c and the SDL calls in i_timer.c.
//
//	The page does the translating: it hands over key codes already in the
//	engine's own numbering (doomkeys.h), so there is no scancode table
//	here. The functions marked KEEPALIVE are the ones it calls.
//

#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "SDL.h"
#include "config.h"
#include "crispy.h"
#include "d_event.h"
#include "doomkeys.h"
#include "doomtype.h"
#include "i_input.h"
#include "i_joystick.h"
#include "i_timer.h"
#include "m_config.h"
#include "m_fixed.h"

float mouse_acceleration = 2.0;
int mouse_threshold = 10;
float mouse_acceleration_y = 1.0;
int mouse_threshold_y = 0;
int mouse_y_invert = 0;
int novert = 1;
int runcentering = 0;
int vanilla_keyboard_mapping = false;

static int mouse_button_state = 0;
static int pending_dx = 0, pending_dy = 0;

// --- called from the page ---------------------------------------------------

EMSCRIPTEN_KEEPALIVE
void web_key(int down, int key, int typed)
{
    event_t event;

    if (key == 0)
    {
        return;
    }

    event.type = down ? ev_keydown : ev_keyup;
    event.data1 = key;
    event.data2 = down ? key : 0;
    event.data3 = down ? typed : 0;
    event.data4 = 0;
    D_PostEvent(&event);
}

// Buttons use the engine's order: 0 left, 1 right, 2 middle, 3 and 4 the wheel.
EMSCRIPTEN_KEEPALIVE
void web_mouse_button(int button, int down)
{
    event_t event;

    if (button < 0 || button >= MAX_MOUSE_BUTTONS)
    {
        return;
    }

    if (down)
    {
        mouse_button_state |= (1 << button);
    }
    else
    {
        mouse_button_state &= ~(1 << button);
    }

    event.type = ev_mouse;
    event.data1 = mouse_button_state;
    event.data2 = event.data3 = event.data4 = 0;
    D_PostEvent(&event);
}

EMSCRIPTEN_KEEPALIVE
void web_mouse_move(int dx, int dy)
{
    pending_dx += dx;
    pending_dy += dy;
}

// Lets go of everything, for when the page loses focus mid-keypress.
EMSCRIPTEN_KEEPALIVE
void web_release_mouse(void)
{
    event_t event;

    pending_dx = pending_dy = 0;

    if (mouse_button_state != 0)
    {
        mouse_button_state = 0;
        event.type = ev_mouse;
        event.data1 = event.data2 = event.data3 = event.data4 = 0;
        D_PostEvent(&event);
    }
}

// --- i_input.h ---------------------------------------------------------------

static int Accelerate(int val, int threshold, float acceleration)
{
    if (val < 0)
    {
        return -Accelerate(-val, threshold, acceleration);
    }

    if (val > threshold)
    {
        return (int) ((val - threshold) * acceleration + threshold);
    }

    return val;
}

void I_ReadMouse(void)
{
    event_t ev;
    int x = pending_dx, y = pending_dy;

    pending_dx = pending_dy = 0;

    if (x != 0 || y != 0)
    {
        ev.type = ev_mouse;
        ev.data1 = mouse_button_state;
        ev.data2 = Accelerate(x, mouse_threshold, mouse_acceleration);
        ev.data3 = -Accelerate(y, mouse_threshold_y, mouse_acceleration_y);
        ev.data4 = 0;
        D_PostEvent(&ev);
    }
}

void I_StartTextInput(int x1, int y1, int x2, int y2)
{
}

void I_StopTextInput(void)
{
}

void I_HandleKeyboardEvent(SDL_Event *sdlevent)
{
}

void I_HandleMouseEvent(SDL_Event *sdlevent)
{
}

void I_BindStrifeInputVariables(void)
{
    M_BindIntVariable("runcentering",              &runcentering);
}

void I_BindInputVariables(void)
{
    M_BindFloatVariable("mouse_acceleration",      &mouse_acceleration);
    M_BindIntVariable("mouse_threshold",           &mouse_threshold);
    M_BindIntVariable("vanilla_keyboard_mapping",  &vanilla_keyboard_mapping);
    M_BindIntVariable("novert",                    &novert);
    M_BindFloatVariable("mouse_acceleration_y",    &mouse_acceleration_y);
    M_BindIntVariable("mouse_threshold_y",         &mouse_threshold_y);
    M_BindIntVariable("mouse_y_invert",            &mouse_y_invert);
}

// --- the SDL calls i_timer.c, i_system.c and m_config.c still make ------------

// Time the page spent hidden or frozen is taken back out of the clock. Left
// in, the engine would wake up owing itself thousands of game tics and play
// them all at once, with the player standing still in the middle of it.
static double lost_ms = 0;

void Web_ForgetTime(double ms)
{
    if (ms > 0)
    {
        lost_ms += ms;
    }
}

static double Now(void)
{
    return emscripten_get_now() - lost_ms;
}

Uint32 SDL_GetTicks(void)
{
    return (Uint32) Now();
}

Uint64 SDL_GetPerformanceCounter(void)
{
    return (Uint64) (Now() * 1000.0);
}

Uint64 SDL_GetPerformanceFrequency(void)
{
    return 1000000;
}

// The one place the engine blocks. Asyncify turns this into "come back later"
// so the page stays alive while the game waits for its next tic.
void SDL_Delay(Uint32 ms)
{
    double before = emscripten_get_now();
    double waited;

    emscripten_sleep(ms);

    // background tabs get their timers throttled to once a second or worse
    waited = emscripten_get_now() - before;
    if (waited > ms + 250)
    {
        Web_ForgetTime(waited - ms);
    }
}

// Config and savegames live under /save, which the page keeps in IndexedDB.
char *SDL_GetPrefPath(const char *org, const char *app)
{
    return strdup("/save/");
}

// --- entry point ---------------------------------------------------------------

// The engine's main(), renamed by the build (see build.sh). The page calls
// web_main() with the command line once the game data is in place.
extern int doom_main(int argc, char **argv);

EMSCRIPTEN_KEEPALIVE
int web_main(int argc, char **argv)
{
    return doom_main(argc, argv);
}
