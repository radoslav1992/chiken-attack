/* Beaver Dash boot: DOM shell, input, persistence, leaderboard, PWA. */

import { Game } from './game.js';
import { sfx, music, unlock, setSound, soundOn } from './audio.js';

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

const store = makeStore('beaver-dash');
const board = makeScoreboard('beaver-dash');

const best = {
  get: () => store.get('best', { score: 0, distance: 0 }),
  set: (v) => store.set('best', v),
};

const pilotName = {
  get: () => store.get('name', 'BEAVER'),
  set: (v) => store.set('name', v),
};

/** Runs finished, used to retire the coaching lines. */
const seen = {
  get() {
    return Number(store.get('seen', 0)) || 0;
  },
  bump() {
    store.set('seen', this.get() + 1);
  },
};

/* ---------------------------------------------------------- global scores -- */

function submitGlobalScore(result) {
  board.submit(
    { score: result.score, wave: Math.round(result.distance || 0), difficulty: result.difficulty },
    pilotName.get()
  );
}

/* ---------------------------------------------------------------- screens -- */

const menuEl = $('#screen-menu');
const overEl = $('#screen-over');
const pauseEl = $('#screen-pause');
const hudEl = $('#hud');

function show(el, on) {
  el.classList.toggle('is-hidden', !on);
}

function syncSoundButtons() {
  const label = soundOn() ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
  $('#btn-sound-2').textContent = label;
}

function startRun() {
  unlock();
  show(menuEl, false);
  show(overEl, false);
  show(pauseEl, false);
  show(hudEl, true);
  game.bestDistance = best.get().distance || 0;
  resetCoach();
  game.newRun();
}

function toMenu() {
  music.stop();
  game.state = 'menu';
  show(hudEl, false);
  show(pauseEl, false);
  show(overEl, false);
  show(menuEl, true);
  refreshBest();
}

$('#btn-start').addEventListener('click', () => {
  sfx.ui();
  startRun();
});

$('#btn-again').addEventListener('click', () => {
  sfx.ui();
  startRun();
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

[$('#btn-sound'), $('#btn-sound-2')].forEach((btn) =>
  btn.addEventListener('click', () => {
    setSound(!soundOn());
    syncSoundButtons();
    sfx.ui();
  })
);

game.on('pause', (on) => {
  show(pauseEl, on);
  show(hudEl, !on);
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
const distEl = $('#hud-dist');
const acornEl = $('#hud-acorns');
const multEl = $('#hud-mult');
const shieldEl = $('#hud-shield');
const phaseEl = $('#hud-phase');

let lastMult = 1;
let lastShield = 0;
let lastPhase = '';

game.on('hud', () => {
  scoreEl.textContent = game.score.toLocaleString('en-US');
  distEl.textContent = `${Math.floor(game.distance)}m`;
  acornEl.textContent = game.acorns + game.goldenTaken * 10;

  if (game.mult !== lastMult) {
    lastMult = game.mult;
    multEl.textContent = `x${game.mult}`;
    show(multEl, game.mult > 1);
  }
  if (game.shield !== lastShield) {
    lastShield = game.shield;
    show(shieldEl, game.shield > 0);
  }
  const label = game.phaseAt(game.distance).now.label;
  if (label !== lastPhase) {
    lastPhase = label;
    phaseEl.textContent = label;
  }
});

game.on('milestone', (m) => {
  const el = $('#milestone');
  el.textContent = `${m}m — FASTER!`;
  el.classList.add('is-live');
  setTimeout(() => el.classList.remove('is-live'), 1400);
});

/* --- first-run coaching --------------------------------------------------
 * Each obstacle type teaches itself once, the first time it is about to
 * matter, and only for a player's first few runs. After that the HUD is quiet.
 */
const COACH = [
  { at: 0, text: 'Tap to hop · hold for a full jump' },
  { at: 120, text: 'Tap again in the air for a double jump' },
  { at: 380, text: 'Heron ahead — stay on the ground' },
  { at: 700, text: 'Three taps: jump, jump, tail-slam through it' },
];
let coachIdx = 0;
let coachTimer = null;

function resetCoach() {
  coachIdx = 0;
  const el = $('#coach');
  el.classList.remove('is-live');
  if (coachTimer) clearTimeout(coachTimer);
}

function tickCoach() {
  if (seen.get() > 2 || game.state !== 'playing') return;
  const next = COACH[coachIdx];
  if (!next || game.distance < next.at) return;
  coachIdx++;
  const el = $('#coach');
  el.textContent = next.text;
  el.classList.add('is-live');
  if (coachTimer) clearTimeout(coachTimer);
  coachTimer = setTimeout(() => el.classList.remove('is-live'), 3200);
}

game.on('hud', tickCoach);

/* --------------------------------------------------------------- game over -- */

const CAUSE = {
  stump: 'Face, meet stump.',
  rock: 'That rock was not going anywhere.',
  logs: 'Ironically felled by lumber.',
  dam: 'The dam needed two jumps, not one.',
  gap: 'Into the drink. Beavers can swim — not forwards, apparently.',
  heron: 'The heron says: stay low next time.',
};

game.on('gameover', (result) => {
  seen.bump();
  const b = best.get();
  const isBest = result.score > b.score;
  if (isBest) best.set({ score: result.score, distance: result.distance });
  submitGlobalScore(result);
  nameSaved = false;
  $('#name-input').value = pilotName.get();

  $('#over-title').textContent = isBest ? 'NEW BEST!' : 'DAM IT!';
  $('#over-cause').textContent = CAUSE[result.cause] || 'The forest wins this round.';
  $('#over-score').textContent = result.score.toLocaleString('en-US');
  $('#over-dist').textContent = `${result.distance}m`;
  $('#over-acorns').textContent = result.acorns + (result.golden ? ` +${result.golden}★` : '');
  $('#over-best').textContent = best.get().score.toLocaleString('en-US');

  // Only mention the flourishes the player actually pulled off.
  const bits = [];
  if (result.smashes) bits.push(`${result.smashes} smashed`);
  if (result.nearMisses) bits.push(`${result.nearMisses} near miss${result.nearMisses > 1 ? 'es' : ''}`);
  if (result.golden) bits.push(`${result.golden} golden`);
  $('#over-extra').textContent = bits.join(' · ');

  show(hudEl, false);
  setTimeout(() => show(overEl, true), 650);
});

/* ------------------------------------------------------------------ input -- */

const JUMP_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'w', 'W']);
const PAUSE_KEYS = new Set(['p', 'P', 'Escape']);

canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'playing') {
    e.preventDefault();
    game.jumpDown();
  }
});
window.addEventListener('pointerup', () => game.jumpUp());
window.addEventListener('pointercancel', () => game.jumpUp());

window.addEventListener('keydown', (e) => {
  if (PAUSE_KEYS.has(e.key)) {
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
  if (!JUMP_KEYS.has(e.key)) return;
  e.preventDefault();
  if (e.repeat) return;
  if (game.state === 'playing') game.jumpDown();
  else if (game.state === 'paused') game.resume();
  else if (!menuEl.classList.contains('is-hidden') || !overEl.classList.contains('is-hidden')) startRun();
});

window.addEventListener('keyup', (e) => {
  if (JUMP_KEYS.has(e.key)) game.jumpUp();
});

/* --------------------------------------------------------------- lifecycle -- */

let resizeTimer = null;
window.addEventListener('resize', () => {
  // Debounced: an on-screen keyboard or an orientation change fires a burst,
  // and each resize rebuilds the parallax decoration.
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 80);
});

// Losing focus mid-jump would otherwise strand the run: pause instead.
pauseOnHide(() => {
  if (document.hidden) game.pause();
});
window.addEventListener('blur', () => game.pause());

/* The arcade game page's sound button reaches in here. */
bridgeArcadeSound((on) => {
  setSound(on);
  syncSoundButtons();
});

['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => unlock(), { once: true, passive: true })
);

registerServiceWorker();

/* -------------------------------------------------------------------- boot -- */

function refreshBest() {
  const b = best.get();
  $('#menu-best').textContent = b.score > 0
    ? `Best: ${b.score.toLocaleString('en-US')} · ${b.distance}m`
    : 'No runs yet';
}

refreshBest();
syncSoundButtons();
game.bestDistance = best.get().distance || 0;
game.resize();
game.start();
