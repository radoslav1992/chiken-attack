# The arcade platform

Everything four games were each implementing separately: the save wrapper, the
leaderboard client, the service worker, the DPR canvas fit, the audio engine and
the bridge to the arcade page.

## Why this exists

Measured before the extraction:

```
                 main.js  audio.js  sw.js   total
chicken-attack     487      554     134     7,046
beaver-dash        392      297     100     2,940
orbit-cadet        395      189     102     2,683
whittle-wares      760      142     103     2,890
```

The four service workers differed from one another by about fifty lines — the
rest was the same file, four times. `api/scores`, `serviceWorker`,
`devicePixelRatio`, `visibilitychange`, `arcade:set-sound` and `AudioContext`
each appeared in all four games.

The line count is not really the point. The point is that **a new game used to
start at zero and had to re-earn a PWA, a service worker, a save system, a
leaderboard and an audio engine before it was a game at all.** That is most of a
session spent on plumbing that already worked four times over.

## What is here

| module | what it owns |
| --- | --- |
| `store.js` | namespaced localStorage that never throws, even in private mode |
| `scores.js` | the leaderboard client: run ids, submission, renaming a run |
| `pwa.js` | service-worker registration, the arcade sound bridge, pause-on-hide |
| `viewport.js` | the device-pixel-ratio canvas fit, done the same way every time |
| `audio-engine.js` | AudioContext, master gain, the sound preference, tone and noise |
| `sw-core.js` | the service worker body, taking a cache name and an asset list |

## What is deliberately NOT here

**Anything that is a game's character.** Each game keeps its own `sfx` table —
the engine synthesises a tone, but which tones make a bumper sound like a bumper
is the game's business. Same for the game loop: three of the four want a fixed
timestep and one does not, and a loop abstraction that serves both is worse than
two loops.

The test for whether something belongs here: *would changing it for one game be
a bug for the other three?* Plumbing, yes. Feel, no.

## Using it from a game

```js
import { makeStore } from '../shared/store.js';
import { makeScoreboard } from '../shared/scores.js';
import { registerServiceWorker, bridgeArcadeSound, pauseOnHide } from '../shared/pwa.js';
import { fitCanvas } from '../shared/viewport.js';
import { unlock, setSound, soundOn, tone, noise } from '../shared/audio-engine.js';

const store = makeStore('your-game');
const board = makeScoreboard('your-game');
```

And the service worker, which is the whole file:

```js
importScripts('/shared/sw-core.js');
self.arcadeServiceWorker({
  version: 'your-game-v1',
  assets: ['./', 'manifest.webmanifest', 'css/styles.css', 'js/main.js', /* ... */],
});
```

## The one rule

`sw-core.js` is loaded by every installed service worker on the origin. A mistake
in it is not a bug in one game, it is four games serving stale or broken files to
anyone who has ever installed them. Change it with the offline test running, and
bump every game's `version` when you do.
