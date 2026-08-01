/* Orbit Cadet boot: DOM shell, input, persistence, leaderboard, PWA. */

import { Game } from './game.js';
import { sfx, unlock, setSound, soundOn } from './audio.js';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const game = new Game(canvas);
window.__game = game;

/* ------------------------------------------------------------- persistence -- */

import { makeStore, cleanName } from '../../shared/store.js';
import { makeScoreboard } from '../../shared/scores.js';
import {
  registerServiceWorker, bridgeArcadeSound, unlockOnFirstGesture, pauseOnHide,
} from '../../shared/pwa.js';

const store = makeStore('orbit-cadet');
const board = makeScoreboard('orbit-cadet');

const best = {
  get: () => store.get('best', { score: 0, rank: 'Cadet' }),
  set: (v) => store.set('best', v),
};

const pilotName = {
  get: () => store.get('name', 'CADET'),
  set: (v) => store.set('name', v),
};

/* ---------------------------------------------------------- global scores -- */

function submitGlobalScore(result) {
  // `wave` is whatever second number a game ranks by: here, the rank reached.
  board.submit({ score: result.score, wave: result.rankIdx + 1 }, pilotName.get());
}

/* ---------------------------------------------------------------- screens -- */

const menuEl = $('#screen-menu');
const overEl = $('#screen-over');
const pauseEl = $('#screen-pause');
const hudEl = $('#hud');
const touchEl = $('#touch');

const show = (el, on) => el.classList.toggle('is-hidden', !on);

function syncSoundButtons() {
  const label = soundOn() ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
  $('#btn-sound-2').textContent = label;
}

function startGame() {
  unlock();
  show(menuEl, false);
  show(overEl, false);
  show(pauseEl, false);
  show(hudEl, true);
  show(touchEl, true);
  game.newGame();
}

function toMenu() {
  game.state = 'menu';
  show(hudEl, false);
  show(touchEl, false);
  show(pauseEl, false);
  show(overEl, false);
  show(menuEl, true);
  refreshBest();
}

$('#btn-start').addEventListener('click', () => {
  sfx.ui();
  startGame();
});
$('#btn-again').addEventListener('click', () => {
  sfx.ui();
  startGame();
});
$('#btn-pause').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.ui();
  game.pause();
});
$('#btn-resume').addEventListener('click', () => {
  sfx.ui();
  game.resume();
});
$('#btn-quit').addEventListener('click', () => {
  sfx.ui();
  toMenu();
});
[$('#btn-sound'), $('#btn-sound-2')].forEach((b) =>
  b.addEventListener('click', () => {
    setSound(!soundOn());
    syncSoundButtons();
    sfx.ui();
  })
);

/* Only one score display at a time: the canvas backglass when there is room
 * beside the table, the DOM HUD when there is not. */
function applyLayout(wide) {
  hudEl.classList.toggle('is-wide', wide);
}
game.on('layout', applyLayout);

game.on('pause', (on) => {
  show(pauseEl, on);
  show(hudEl, !on);
  show(touchEl, !on);
});

let nameSaved = false;
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});
$('#name-input').addEventListener('blur', saveName);

function saveName() {
  if (nameSaved) return;
  const clean = cleanName($('#name-input').value, '');
  if (!clean) return;
  pilotName.set(clean);
  nameSaved = true;
  $('#btn-save-name').textContent = 'Saved';
  board.rename(pilotName.get());
  sfx.ui();
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
  }, 1500);
}

/* -------------------------------------------------------------------- hud -- */

const scoreEl = $('#hud-score');
const rankEl = $('#hud-rank');
const ballsEl = $('#hud-balls');
const missionEl = $('#hud-mission');
const tiltEl = $('#hud-tilt');
const plungeEl = $('.touch-plunge');

let lastRank = '';
let lastBalls = '';
let lastMission = '';
let lastTilt = false;
let lastArmed = null;

game.on('hud', () => {
  scoreEl.textContent = game.score.toLocaleString('en-US');

  if (game.rank !== lastRank) {
    lastRank = game.rank;
    rankEl.textContent = game.rank;
  }

  const balls = `Ball ${game.ballNo} · ${game.ballsLeft} left`;
  if (balls !== lastBalls) {
    lastBalls = balls;
    ballsEl.textContent = balls;
  }

  const m = game.mission ? `${game.mission.name} ${game.missionProgress}/${game.mission.goal}` : '';
  if (m !== lastMission) {
    lastMission = m;
    missionEl.textContent = m;
    show(missionEl, !!m);
  }

  const tilt = game.tilted || game.tiltWarn > 0;
  if (tilt !== lastTilt) {
    lastTilt = tilt;
    tiltEl.textContent = game.tilted ? 'TILTED' : 'TILT WARNING';
    show(tiltEl, tilt);
  }

  // The launch strip only means anything while a ball waits in the lane.
  if (game.inLane !== lastArmed) {
    lastArmed = game.inLane;
    plungeEl.classList.toggle('is-spent', !game.inLane);
  }
  plungeEl.classList.toggle('is-armed', game.inLane && game.plunger > 0.02);
});

game.on('gameover', (result) => {
  const b = best.get();
  const isBest = result.score > b.score;
  if (isBest) best.set({ score: result.score, rank: result.rank });
  submitGlobalScore(result);
  nameSaved = false;
  $('#name-input').value = pilotName.get();

  $('#over-title').textContent = isBest ? 'NEW BEST!' : 'GAME OVER';
  $('#over-rank').textContent =
    result.rankIdx >= 6
      ? 'Admiral. There is nothing left to promote you to.'
      : result.missions > 0
        ? `Discharged as ${result.rank}. ${result.missions} mission${result.missions > 1 ? 's' : ''} flown.`
        : 'Not one mission flown. Roll over the MISSION target to arm one.';
  $('#over-score').textContent = result.score.toLocaleString('en-US');
  $('#over-rankv').textContent = result.rank;
  $('#over-missions').textContent = result.missions;
  $('#over-best').textContent = best.get().score.toLocaleString('en-US');
  show(hudEl, false);
  show(touchEl, false);
  setTimeout(() => show(overEl, true), 900);
});

/* ------------------------------------------------------------------ input -- */

/* Touch. Pointer capture per zone, because a thumb that slides off the left
 * half mid-flip should not silently drop the flipper. */
const active = new Map();

for (const zone of document.querySelectorAll('[data-flip]')) {
  const side = zone.dataset.flip;
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    active.set(e.pointerId, side);
    game.flip(side, true);
  });
  const release = (e) => {
    if (active.get(e.pointerId) !== side) return;
    active.delete(e.pointerId);
    game.flip(side, false);
  };
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);
}

const plungeZone = $('[data-plunge]');
plungeZone.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  plungeZone.setPointerCapture(e.pointerId);
  game.plungeHold(true);
});
const plungeRelease = (e) => {
  e.stopPropagation();
  game.plungeHold(false);
};
plungeZone.addEventListener('pointerup', plungeRelease);
plungeZone.addEventListener('pointercancel', plungeRelease);

for (const zone of document.querySelectorAll('[data-nudge]')) {
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.nudge(Number(zone.dataset.nudge));
  });
}

/* Keyboard: the arrangement a pinball player expects. */
const LEFT = new Set(['ArrowLeft', 'a', 'A', 'z', 'Z', 'Shift']);
const RIGHT = new Set(['ArrowRight', 'd', 'D', '/', "'"]);
const LAUNCH = new Set([' ', 'Spacebar', 'Enter']);
const PAUSE = new Set(['p', 'P', 'Escape']);

window.addEventListener('keydown', (e) => {
  if (PAUSE.has(e.key)) {
    e.preventDefault();
    if (game.state === 'playing') {
      sfx.ui();
      game.pause();
    } else if (game.state === 'paused') {
      sfx.ui();
      game.resume();
    }
    return;
  }
  if (e.repeat) {
    if (LAUNCH.has(e.key)) e.preventDefault();
    return;
  }
  if (LEFT.has(e.key)) {
    e.preventDefault();
    game.flip('L', true);
  } else if (RIGHT.has(e.key)) {
    e.preventDefault();
    game.flip('R', true);
  } else if (LAUNCH.has(e.key)) {
    e.preventDefault();
    if (game.state === 'playing') game.plungeHold(true);
    else if (!menuEl.classList.contains('is-hidden') || !overEl.classList.contains('is-hidden')) startGame();
    else if (game.state === 'paused') game.resume();
  } else if (e.key === 'ArrowDown' || e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    game.nudge(0);
  } else if (e.key === ',' || e.key === '<') {
    game.nudge(-1);
  } else if (e.key === '.' || e.key === '>') {
    game.nudge(1);
  }
});

window.addEventListener('keyup', (e) => {
  if (LEFT.has(e.key)) game.flip('L', false);
  else if (RIGHT.has(e.key)) game.flip('R', false);
  else if (LAUNCH.has(e.key)) game.plungeHold(false);
});

/* --------------------------------------------------------------- lifecycle -- */

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 80);
});

// Losing focus mid-ball would strand the game; pause instead.
pauseOnHide(() => {
  if (document.hidden) game.pause();
});
window.addEventListener('blur', () => {
  // Release both flippers too, or one sticks up until the next press.
  game.flip('L', false);
  game.flip('R', false);
  game.pause();
});

/* The arcade game page's sound button reaches in here. */
bridgeArcadeSound((on) => {
  setSound(on);
  syncSoundButtons();
});

unlockOnFirstGesture(unlock);

registerServiceWorker();

/* -------------------------------------------------------------------- boot -- */

function refreshBest() {
  const b = best.get();
  $('#menu-best').textContent = b.score > 0 ? `Best: ${b.score.toLocaleString('en-US')} · ${b.rank}` : 'No games yet';
}

refreshBest();
syncSoundButtons();
game.resize();
applyLayout(game.wide);
game.start();
