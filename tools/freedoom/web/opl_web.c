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
//	Music for the browser build: an OPL driver whose "sound card" is the
//	Nuked OPL3 emulator, played out through the page.
//
//	The music code (i_oplmusic.c) drives an OPL chip by writing registers
//	and asking to be called back after so many microseconds. On a desktop
//	a mixer thread keeps that clock. Here there are no threads: the page's
//	audio callback asks web_opl_render() for the next block of samples,
//	and the clock moves forward by exactly as much sound as was produced.
//
//	It follows the driver interface in opl_internal.h, as opl_sdl.c from
//	Chocolate Doom (Copyright(C) 2005-2014 Simon Howard) does for SDL.
//

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

#include "opl.h"
#include "opl3.h"
#include "opl_internal.h"
#include "opl_queue.h"

typedef struct
{
    unsigned int rate;      // ticks per second
    int enabled;
    unsigned int value;     // last value written
    uint64_t expires;       // when it next overflows, in microseconds
} chip_timer_t;

static opl3_chip chip;
static opl_callback_queue_t *queue = NULL;
static chip_timer_t timer1 = { 12500, 0, 0, 0 };
static chip_timer_t timer2 = { 3125, 0, 0, 0 };

static uint64_t now_us;         // how much sound has been made, as time
static uint64_t paused_us;      // how much of that was made while paused
static int paused;
static int running;
static int selected_register;
static unsigned int rate;

// Runs every callback that has come due.
static void RunDueCallbacks(void)
{
    opl_callback_t callback;
    void *data;

    while (!OPL_Queue_IsEmpty(queue)
        && now_us >= OPL_Queue_Peek(queue) + paused_us)
    {
        if (!OPL_Queue_Pop(queue, &callback, &data))
        {
            break;
        }

        callback(data);
    }
}

static void Advance(uint64_t us)
{
    now_us += us;

    if (paused)
    {
        paused_us += us;
    }

    RunDueCallbacks();
}

// Moves the clock on without making any sound. opl.c uses this in place of
// a real delay while it probes for the chip.
void OPL_Web_Advance(uint64_t us)
{
    if (running)
    {
        Advance(us);
    }
}

// Called by the page. Fills `out` with `frames` stereo 16-bit frames and
// returns how many it wrote; zero means "nothing playing, treat as silence".
EMSCRIPTEN_KEEPALIVE
int web_opl_render(int16_t *out, int frames)
{
    int done = 0;

    if (!running || frames <= 0)
    {
        return 0;
    }

    while (done < frames)
    {
        int n = frames - done;

        // Stop at the next callback, so a note change lands on the sample
        // it belongs to rather than at the end of the block.
        if (!paused && !OPL_Queue_IsEmpty(queue))
        {
            uint64_t due = OPL_Queue_Peek(queue) + paused_us;
            uint64_t until = 0;

            if (due > now_us)
            {
                until = ((due - now_us) * rate + OPL_SECOND - 1) / OPL_SECOND;
            }

            if (until < (uint64_t) n)
            {
                n = (int) until;
            }
        }

        if (n > 0)
        {
            OPL3_GenerateStream(&chip, out + done * 2, n);
            done += n;
        }

        Advance(((uint64_t) n * OPL_SECOND) / rate);

        // A callback due "now" that asks to be called again "now" would
        // otherwise spin here for ever; nudge the clock past it.
        if (n == 0)
        {
            Advance(1);
        }
    }

    return done;
}

static int OPL_Web_Init(unsigned int port_base)
{
    rate = opl_sample_rate;
    queue = OPL_Queue_Create();
    now_us = 0;
    paused_us = 0;
    paused = 0;
    selected_register = 0;
    timer1.enabled = timer2.enabled = 0;

    OPL3_Reset(&chip, rate);
    running = 1;

    return 1;
}

static void OPL_Web_Shutdown(void)
{
    if (running)
    {
        running = 0;
        OPL_Queue_Destroy(queue);
        queue = NULL;
    }
}

static unsigned int OPL_Web_PortRead(opl_port_t port)
{
    unsigned int status = 0;

    if (port == OPL_REGISTER_PORT_OPL3)
    {
        return 0xff;
    }

    if (timer1.enabled && now_us > timer1.expires)
    {
        status |= 0x80 | 0x40;
    }

    if (timer2.enabled && now_us > timer2.expires)
    {
        status |= 0x80 | 0x20;
    }

    return status;
}

static void ArmTimer(chip_timer_t *timer)
{
    if (timer->enabled)
    {
        timer->expires = now_us
                       + ((uint64_t) (0x100 - timer->value) * OPL_SECOND) / timer->rate;
    }
}

static void WriteRegister(unsigned int reg, unsigned int value)
{
    switch (reg)
    {
        case OPL_REG_TIMER1:
            timer1.value = value;
            ArmTimer(&timer1);
            break;

        case OPL_REG_TIMER2:
            timer2.value = value;
            ArmTimer(&timer2);
            break;

        case OPL_REG_TIMER_CTRL:
            if (value & 0x80)
            {
                timer1.enabled = 0;
                timer2.enabled = 0;
            }
            else
            {
                if ((value & 0x40) == 0)
                {
                    timer1.enabled = (value & 0x01) != 0;
                    ArmTimer(&timer1);
                }

                if ((value & 0x20) == 0)
                {
                    timer2.enabled = (value & 0x02) != 0;
                    ArmTimer(&timer2);
                }
            }
            break;

        default:
            OPL3_WriteRegBuffered(&chip, reg, value);
            break;
    }
}

static void OPL_Web_PortWrite(opl_port_t port, unsigned int value)
{
    if (port == OPL_REGISTER_PORT)
    {
        selected_register = value;
    }
    else if (port == OPL_REGISTER_PORT_OPL3)
    {
        selected_register = value | 0x100;
    }
    else if (port == OPL_DATA_PORT)
    {
        WriteRegister(selected_register, value);
    }
}

static void OPL_Web_SetCallback(uint64_t us, opl_callback_t callback, void *data)
{
    OPL_Queue_Push(queue, callback, data, now_us - paused_us + us);
}

static void OPL_Web_ClearCallbacks(void)
{
    OPL_Queue_Clear(queue);
}

// One thread: nothing to lock against.
static void OPL_Web_Lock(void)
{
}

static void OPL_Web_Unlock(void)
{
}

static void OPL_Web_SetPaused(int _paused)
{
    paused = _paused;
}

static void OPL_Web_AdjustCallbacks(float factor)
{
    OPL_Queue_AdjustCallbacks(queue, now_us, factor);
}

opl_driver_t opl_web_driver =
{
    "Web",
    OPL_Web_Init,
    OPL_Web_Shutdown,
    OPL_Web_PortRead,
    OPL_Web_PortWrite,
    OPL_Web_SetCallback,
    OPL_Web_ClearCallbacks,
    OPL_Web_Lock,
    OPL_Web_Unlock,
    OPL_Web_SetPaused,
    OPL_Web_AdjustCallbacks
};
