/* Beaver Dash boot: DOM shell, input, persistence, leaderboard, PWA. */

import { Game } from './game.js';
import { sfx, unlock, setSound, soundOn } from './audio.js';

const $ = (sel) => document.querySelector(sel);

const canvas = $('#game');
const game = new Game(canvas);
window.__game = game;

/* ------------------------------------------------------------- persistence -- */

const BEST_KEY = 'beaver-dash.best';
const NAME_KEY = 'beaver-dash.name';

const best = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY)) || { score: 0, distance: 0 };
    } catch {
      return { score: 0, distance: 0 };
    }
  },
  set(v) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(v));
    } catch {}
  },
};

const pilotName = {
  get() {
    try {
      return localStorage.getItem(NAME_KEY) || 'BEAVER';
    } catch {
      return 'BEAVER';
    }
  },
  set(v) {
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {}
  },
};

/* ---------------------------------------------------------- global scores -- */

let lastRun = null;

function submitGlobalScore(result) {
  if (result.score <= 0) return;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  lastRun = {
    id,
    game: 'beaver-dash',
    score: Math.floor(result.score),
    wave: Math.floor(result.distance), // metres, stored in the wave column
    difficulty: 'veteran',
  };
  pushGlobalScore();
}

function pushGlobalScore() {
  if (!lastRun) return;
  fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...lastRun, name: pilotName.get() }),
  }).catch(() => {
    /* offline or standalone install — local best still works */
  });
}

/* ---------------------------------------------------------------- screens -- */

const menuEl = $('#screen-menu');
const overEl = $('#screen-over');
const hudEl = $('#hud');

function show(el, on) {
  el.classList.toggle('is-hidden', !on);
}

function syncSoundButtons() {
  const label = soundOn() ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
}

function startRun() {
  unlock();
  show(menuEl, false);
  show(overEl, false);
  show(hudEl, true);
  game.newRun();
}

$('#btn-start').addEventListener('click', () => {
  sfx.ui();
  startRun();
});

$('#btn-again').addEventListener('click', () => {
  sfx.ui();
  startRun();
});

$('#btn-sound').addEventListener('click', () => {
  setSound(!soundOn());
  syncSoundButtons();
  sfx.ui();
});

let nameSaved = false;
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});
$('#name-input').addEventListener('blur', saveName);

function saveName() {
  if (nameSaved) return;
  const clean = $('#name-input').value.toUpperCase().replace(/[^A-Z0-9 .\-_]/g, '').trim().slice(0, 12);
  if (!clean) return;
  pilotName.set(clean);
  nameSaved = true;
  $('#btn-save-name').textContent = 'Saved';
  pushGlobalScore();
  sfx.ui();
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
  }, 1500);
}

/* -------------------------------------------------------------------- hud -- */

const scoreEl = $('#hud-score');
const distEl = $('#hud-dist');
const acornEl = $('#hud-acorns');

game.on('hud', () => {
  scoreEl.textContent = game.score.toLocaleString('en-US');
  distEl.textContent = `${Math.floor(game.distance)}m`;
  acornEl.textContent = game.acorns + (game.goldenTaken || 0) * 10;
});

game.on('milestone', (m) => {
  const el = $('#milestone');
  el.textContent = `${m}m — FASTER!`;
  el.classList.add('is-live');
  setTimeout(() => el.classList.remove('is-live'), 1400);
});

game.on('gameover', (result) => {
  const b = best.get();
  const isBest = result.score > b.score;
  if (isBest) best.set({ score: result.score, distance: result.distance });
  submitGlobalScore(result);
  nameSaved = false;
  $('#name-input').value = pilotName.get();

  $('#over-title').textContent = isBest ? 'NEW BEST!' : 'DAM IT!';
  $('#over-cause').textContent = {
    stump: 'Face, meet stump.',
    rock: 'That rock was not going anywhere.',
    logs: 'Ironically felled by lumber.',
    heron: 'The heron says: stay low next time.',
  }[result.cause] || 'The forest wins this round.';
  $('#over-score').textContent = result.score.toLocaleString('en-US');
  $('#over-dist').textContent = `${result.distance}m`;
  $('#over-acorns').textContent = result.acorns + (result.golden ? ` +${result.golden}★` : '');
  $('#over-best').textContent = best.get().score.toLocaleString('en-US');
  show(hudEl, false);
  setTimeout(() => show(overEl, true), 650);
});

/* ------------------------------------------------------------------ input -- */

function pressDown(e) {
  if (game.state === 'playing') {
    e.preventDefault();
    game.jumpDown();
  }
}

function pressUp() {
  game.jumpUp();
}

canvas.addEventListener('pointerdown', pressDown);
window.addEventListener('pointerup', pressUp);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
    if (game.state === 'playing') {
      e.preventDefault();
      game.jumpDown();
    } else if (!menuEl.classList.contains('is-hidden') || !overEl.classList.contains('is-hidden')) {
      startRun();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') pressUp();
});

/* --------------------------------------------------------------- lifecycle -- */

window.addEventListener('resize', () => game.resize());
document.addEventListener('visibilitychange', () => {
  // No pause menu in a runner: a hidden tab simply freezes the loop (rAF
  // stops); nothing time-based advances while frozen.
});

/* The arcade game page's sound button reaches in here. */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const msg = e.data;
  if (!msg || msg.type !== 'arcade:set-sound') return;
  setSound(!!msg.on);
  syncSoundButtons();
});

['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => unlock(), { once: true, passive: true })
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* -------------------------------------------------------------------- boot -- */

$('#menu-best').textContent = best.get().score > 0
  ? `Best: ${best.get().score.toLocaleString('en-US')} · ${best.get().distance}m`
  : 'No runs yet';
syncSoundButtons();
game.resize();
game.start();
