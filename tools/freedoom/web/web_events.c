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
//	Tells the page what happened. See web_events.h.
//

#include <emscripten.h>

#include "web_events.h"

EM_JS(void, js_event, (int kind, int a, int b, int c, int d, int e, int f, int g, int h, int i), {
    if (Module.webEvent) Module.webEvent(kind, [a, b, c, d, e, f, g, h, i]);
});

void Web_NewGame(int skill, int map)
{
    js_event(1, skill, map, 0, 0, 0, 0, 0, 0, 0);
}

void Web_GameLoaded(int skill, int map)
{
    js_event(2, skill, map, 0, 0, 0, 0, 0, 0, 0);
}

void Web_LevelDone(int map, int kills, int total_kills, int items,
                   int total_items, int secrets, int total_secrets,
                   int seconds, int skill)
{
    js_event(3, map, kills, total_kills, items, total_items, secrets,
             total_secrets, seconds, skill);
}

void Web_PlayerDied(int map, int kills, int skill)
{
    js_event(4, map, kills, skill, 0, 0, 0, 0, 0, 0);
}
