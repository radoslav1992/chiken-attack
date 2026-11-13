//
// Copyright(C) 1993-1996 Id Software, Inc.
// Copyright(C) 2005-2014 Simon Howard
// Copyright(C) 2014-2023 Fabian Greffrath
// Copyright(C) 2026 Beaver Games contributors
//
// Parts of this file are adapted from i_joystick.c in Crispy Doom.
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
//	The parts of the engine that have nothing to do in a browser:
//	joysticks, the text-mode exit screen and the network lobby. Each is
//	the smallest thing that satisfies the header.
//

#include "config.h"
#include "doomtype.h"
#include "i_endoom.h"
#include "i_joystick.h"
#include "m_config.h"
#include "m_misc.h"
#include "net_gui.h"

// Gamepads are read by the page and arrive as key presses, so the engine's
// own joystick support is switched off. The variables stay because the
// config file names them.
static int usejoystick = 0;
static char *joystick_guid = "";
static int joystick_index = -1;
static int joystick_x_axis = 0, joystick_x_invert = 0;
static int joystick_y_axis = 1, joystick_y_invert = 0;
static int joystick_strafe_axis = -1, joystick_strafe_invert = 0;
static int joystick_look_axis = -1, joystick_look_invert = 0;
static int joystick_physical_buttons[NUM_VIRTUAL_BUTTONS] =
{
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
};

void I_InitJoystick(void)
{
}

void I_ShutdownJoystick(void)
{
}

void I_UpdateJoystick(void)
{
}

void I_BindJoystickVariables(void)
{
    int i;

    M_BindIntVariable("use_joystick",              &usejoystick);
    M_BindStringVariable("joystick_guid",          &joystick_guid);
    M_BindIntVariable("joystick_index",            &joystick_index);
    M_BindIntVariable("joystick_x_axis",           &joystick_x_axis);
    M_BindIntVariable("joystick_y_axis",           &joystick_y_axis);
    M_BindIntVariable("joystick_strafe_axis",      &joystick_strafe_axis);
    M_BindIntVariable("joystick_x_invert",         &joystick_x_invert);
    M_BindIntVariable("joystick_y_invert",         &joystick_y_invert);
    M_BindIntVariable("joystick_strafe_invert",    &joystick_strafe_invert);
    M_BindIntVariable("joystick_look_axis",        &joystick_look_axis);
    M_BindIntVariable("joystick_look_invert",      &joystick_look_invert);

    for (i = 0; i < NUM_VIRTUAL_BUTTONS; ++i)
    {
        char name[32];
        M_snprintf(name, sizeof(name), "joystick_physical_button%i", i);
        M_BindIntVariable(name, &joystick_physical_buttons[i]);
    }
}

// The DOS exit screen. A tab that is closing has no use for it.
void I_Endoom(byte *data)
{
}

// Only reached when joining a network game, which this build cannot do.
void NET_WaitForLaunch(void)
{
}

// "-dedicated" would run a server with no game attached. Not in a browser.
void NET_DedicatedServer(void)
{
}
