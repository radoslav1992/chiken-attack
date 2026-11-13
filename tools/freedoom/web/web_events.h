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
//	Things the page wants to hear about: a game starting, a level being
//	finished, the player dying. The arcade keeps a score from them.
//

#ifndef WEB_EVENTS_H
#define WEB_EVENTS_H

void Web_NewGame(int skill, int map);
void Web_GameLoaded(int skill, int map);
void Web_LevelDone(int map, int kills, int total_kills, int items,
                   int total_items, int secrets, int total_secrets,
                   int seconds, int skill);
void Web_PlayerDied(int map, int kills, int skill);

#endif
