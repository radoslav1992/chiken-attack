/*
 * Boot + DOM shell: screen routing, settings, PWA install and the handful of
 * HUD elements that live outside the canvas.
 */

import { Game } from './game.js';
import { settings, scores, highScore } from './storage.js';
import { sfx, music, unlock as unlockAudio, syncMusicSetting, suspend as suspendAudio, resume as resumeAudio } from './audio.js';
import { formatScore } from './util.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const canvas = $('#game');
const game = new Game(canvas);
// Handy for debugging from the console (and for the smoke tests in tools/).
window.__game = game;

/* --------------------------------------------------------------- safe area -- */

const probe = document.createElement('div');
probe.style.cssText =
  'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);';
document.body.appendChild(probe);

function measureSafeArea() {
  const cs = getComputedStyle(probe);
  game.safeTop = parseFloat(cs.paddingTop) || 0;
  game.safeBottom = parseFloat(cs.paddingBottom) || 0;
}

/* ----------------------------------------------------------------- screens -- */

const SCREENS = {
  menu: $('#screen-menu'),
  how: $('#screen-how'),
  scores: $('#screen-scores'),
  settings: $('#screen-settings'),
  paused: $('#screen-paused'),
  gameover: $('#screen-gameover'),
};

let currentScreen = 'menu';
let lastMenuScreen = 'menu';

function show(name) {
  for (const [key, el] of Object.entries(SCREENS)) {
    el.classList.toggle('is-active', key === name);
  }
  currentScreen = name || null;
  if (name === 'menu') lastMenuScreen = 'menu';
  document.body.dataset.screen = name || 'game';
}

function showHud(on) {
  $('#hud').classList.toggle('is-hidden', !on);
}

/* ---------------------------------------------------------------- settings -- */

function syncSettingsUi() {
  $$('input[data-setting]').forEach((input) => {
    input.checked = !!settings.get(input.dataset.setting);
  });
  $$('[data-control]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(settings.get('controls') === btn.dataset.control));
  });
}

$$('input[data-setting]').forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.setting;
    settings.set(key, input.checked);
    // Mirror the same setting across the settings and pause sheets.
    $$(`input[data-setting="${key}"]`).forEach((other) => {
      other.checked = input.checked;
    });
    if (key === 'music') {
      unlockAudio();
      syncMusicSetting(game.state !== 'attract' && game.state !== 'boot');
      if (input.checked && game.player) music.start(game.wave && game.wave.isBoss ? 'boss' : 'space');
    }
    if (key === 'sound' && input.checked) {
      unlockAudio();
      sfx.ui();
    }
  });
});

$$('[data-control]').forEach((btn) => {
  btn.addEventListener('click', () => {
    settings.set('controls', btn.dataset.control);
    syncSettingsUi();
    sfx.ui();
  });
});

/* ------------------------------------------------------------------ scores -- */

function renderScores() {
  const list = $('#score-list');
  const rows = scores();
  list.innerHTML = '';
  $('#score-empty').classList.toggle('is-hidden', rows.length > 0);
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    if (i === 0) li.classList.add('is-top');
    li.innerHTML =
      `<span class="pos">${i + 1}</span>` +
      `<span class="nm">${row.name}</span>` +
      `<span class="wv">wave ${row.wave}</span>` +
      `<span class="pts">${formatScore(row.score)}</span>`;
    list.appendChild(li);
  });
}

function renderBest() {
  $('#best-line').textContent = `Best: ${formatScore(highScore())}`;
}

/* ------------------------------------------------------------- menu wiring -- */

function startGame() {
  unlockAudio();
  show(null);
  showHud(true);
  hintShown = false;
  const hint = $('#touch-hint');
  hint.classList.remove('is-gone');
  hint.textContent = settings.get('autofire') ? 'Drag to fly' : 'Drag to fly & fire';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(dismissHint, 4500);
  game.newGame();
}

function dismissHint() {
  if (hintShown) return;
  hintShown = true;
  clearTimeout(hintTimer);
  $('#touch-hint').classList.add('is-gone');
}

$('#btn-play').addEventListener('click', () => {
  sfx.ui();
  startGame();
});

$('#btn-how').addEventListener('click', () => {
  sfx.ui();
  show('how');
});

$('#btn-scores').addEventListener('click', () => {
  sfx.ui();
  renderScores();
  show('scores');
});

$('#btn-settings').addEventListener('click', () => {
  sfx.ui();
  syncSettingsUi();
  show('settings');
});

$$('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => {
    sfx.uiBack();
    show(lastMenuScreen);
  });
});

/* -------------------------------------------------------------- pause menu -- */

$('#btn-pause').addEventListener('click', () => {
  sfx.ui();
  game.togglePause();
});

$('#btn-resume').addEventListener('click', () => {
  sfx.ui();
  game.togglePause();
});

$('#btn-restart').addEventListener('click', () => {
  sfx.ui();
  show(null);
  showHud(true);
  game.togglePause(); // leave paused state
  startGame();
});

$('#btn-quit').addEventListener('click', () => {
  sfx.uiBack();
  showHud(false);
  game.quitToMenu();
  renderBest();
  show('menu');
});

game.on('pause', (paused) => {
  if (paused) {
    syncSettingsUi();
    show('paused');
  } else if (currentScreen === 'paused') {
    show(null);
  }
});

/* -------------------------------------------------------------- game over -- */

game.on('gameover', (result) => {
  showHud(false);
  $('#go-score').textContent = formatScore(result.score);
  $('#go-wave').textContent = result.wave;
  $('#go-kills').textContent = result.stats.kills;
  $('#go-food').textContent = result.stats.food;
  $('#go-best').textContent = formatScore(result.best);
  $('#go-waves').textContent = result.stats.waves;
  const rankEl = $('#go-rank');
  if (result.rank === 1) {
    $('#go-title').textContent = 'New High Score!';
    rankEl.textContent = 'You are the top chicken hunter.';
  } else if (result.rank > 1) {
    $('#go-title').textContent = 'Game Over';
    rankEl.textContent = `#${result.rank} on the leaderboard`;
  } else {
    $('#go-title').textContent = 'Game Over';
    rankEl.textContent = '';
  }
  renderBest();
  show('gameover');
});

$('#btn-again').addEventListener('click', () => {
  sfx.ui();
  startGame();
});

$('#btn-menu').addEventListener('click', () => {
  sfx.uiBack();
  game.quitToMenu();
  renderBest();
  show('menu');
});

/* -------------------------------------------------------------- hud extras -- */

const missileBtn = $('#btn-missile');
const missileCount = $('#missile-count');
let hintShown = false;
let hintTimer = 0;

missileBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (game.player) game.player.fireMissile();
});

game.on('hud', (s) => {
  missileCount.textContent = s.missiles;
  missileBtn.classList.toggle('is-empty', s.missiles <= 0);
});

// Fade the "drag to fly" hint once the player actually flies.
canvas.addEventListener('pointerdown', dismissHint, { passive: true });

/* --------------------------------------------------------------- lifecycle -- */

function resizeAll() {
  measureSafeArea();
  game.resize();
}

window.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', () => setTimeout(resizeAll, 260));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeAll);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'playing' || game.state === 'wave-intro' || game.state === 'wave-clear') {
      game.togglePause(true);
    }
    suspendAudio();
  } else {
    resumeAudio();
  }
});

// Any first gesture unlocks the audio context on mobile browsers.
['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => unlockAudio(), { once: true, passive: true })
);

/* ------------------------------------------------------------ PWA install -- */

let installEvent = null;
const installBtn = $('#btn-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  installBtn.classList.remove('is-hidden');
});

installBtn.addEventListener('click', async () => {
  sfx.ui();
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  if (outcome === 'accepted') installBtn.classList.add('is-hidden');
  installEvent = null;
});

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('is-hidden');
  installEvent = null;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}

/* -------------------------------------------------------------------- boot -- */

measureSafeArea();
game.resize();
syncSettingsUi();
renderBest();
show('menu');
game.startAttract();
