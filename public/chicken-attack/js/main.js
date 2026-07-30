/*
 * Boot + DOM shell: screen routing, settings, PWA install and the handful of
 * HUD elements that live outside the canvas.
 */

import { Game } from './game.js';
import { settings, scores, highScore, lifetimeStats, loadRun, clearRun, nameLastScore, lastName } from './storage.js';
import { sfx, music, unlock as unlockAudio, syncMusicSetting, suspend as suspendAudio, resume as resumeAudio } from './audio.js';
import { formatScore } from './util.js';
import { DIFFICULTIES, difficultyMode } from './waves.js';

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

function syncDifficultyUi() {
  const current = settings.get('difficulty');
  $$('[data-difficulty]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.difficulty === current));
  });
  const mode = difficultyMode(current);
  $('#difficulty-blurb').textContent = `${mode.name} — ${mode.blurb}`;
}

/** The Continue button only appears when there is a run worth resuming. */
function syncContinueUi() {
  const run = loadRun();
  const btn = $('#btn-continue');
  btn.classList.toggle('is-hidden', !run);
  if (run) {
    const mode = difficultyMode(run.difficulty);
    $('#continue-note').textContent =
      `Wave ${run.wave} · ${formatScore(run.score)} pts · ${mode.name}`;
  }
  return run;
}

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
    const mode = DIFFICULTIES[row.difficulty] ? row.difficulty : 'veteran';
    // Built from DOM nodes rather than innerHTML: names are player input.
    const cells = [
      ['span', 'pos', String(i + 1)],
      ['span', 'nm', row.name],
      ['span', `diff is-${mode}`, DIFFICULTIES[mode].badge],
      ['span', 'wv', `wave ${row.wave}`],
      ['span', 'pts', formatScore(row.score)],
    ];
    for (const [tag, cls, text] of cells) {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      li.appendChild(el);
    }
    list.appendChild(li);
  });

  const lt = lifetimeStats();
  $('#lt-games').textContent = formatScore(lt.games);
  $('#lt-wave').textContent = lt.bestWave;
  $('#lt-kills').textContent = formatScore(lt.kills);
  $('#lt-food').textContent = formatScore(lt.food);
  $('#lifetime').classList.toggle('is-hidden', lt.games === 0);
}

function renderBest() {
  $('#best-line').textContent = `Best: ${formatScore(highScore())}`;
}

/* ------------------------------------------------------------- menu wiring -- */

function startGame(resume = null) {
  unlockAudio();
  show(null);
  showHud(true);
  hintShown = false;
  const hint = $('#touch-hint');
  hint.classList.remove('is-gone');
  hint.textContent = settings.get('autofire') ? 'Drag to fly' : 'Drag to fly & fire';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(dismissHint, 4500);
  game.newGame(resume);
}

function dismissHint() {
  if (hintShown) return;
  hintShown = true;
  clearTimeout(hintTimer);
  $('#touch-hint').classList.add('is-gone');
}

$('#btn-play').addEventListener('click', () => {
  sfx.ui();
  clearRun();
  startGame();
});

$('#btn-continue').addEventListener('click', () => {
  sfx.ui();
  const run = loadRun();
  if (!run) {
    syncContinueUi();
    return;
  }
  startGame(run);
});

$$('[data-difficulty]').forEach((btn) => {
  btn.addEventListener('click', () => {
    settings.set('difficulty', btn.dataset.difficulty);
    syncDifficultyUi();
    sfx.ui();
  });
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
  clearRun();
  startGame();
});

$('#btn-quit').addEventListener('click', () => {
  sfx.uiBack();
  showHud(false);
  game.autosave();
  game.quitToMenu();
  renderBest();
  syncContinueUi();
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

/* ---------------------------------------------------------- global scores -- */

/*
 * Fire-and-forget submission to the arcade's leaderboard API. The run id is
 * client-generated so saving a name after game over renames the same run.
 * Offline or API-less installs just skip it — the local table still works.
 */
let lastRun = null;

function submitGlobalScore(result) {
  if (result.score <= 0) return;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  lastRun = {
    id,
    game: 'chicken-attack',
    score: Math.floor(result.score),
    wave: result.wave,
    difficulty: result.difficulty ? result.difficulty.id : 'veteran',
  };
  pushGlobalScore();
}

function pushGlobalScore() {
  if (!lastRun) return;
  fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...lastRun, name: lastName() }),
  }).catch(() => {
    /* offline or standalone install — local scores only */
  });
}

/* -------------------------------------------------------------- game over -- */

game.on('gameover', (result) => {
  showHud(false);
  submitGlobalScore(result);
  $('#go-score').textContent = formatScore(result.score);
  $('#go-wave').textContent = result.wave;
  $('#go-kills').textContent = result.stats.kills;
  $('#go-food').textContent = result.stats.food;
  $('#go-best').textContent = formatScore(result.best);
  $('#go-waves').textContent = result.stats.waves;
  const nameForm = $('#name-form');
  const nameInput = $('#name-input');
  nameForm.classList.toggle('is-hidden', result.rank === 0);
  if (result.rank > 0) {
    nameInput.value = lastName();
    nameSaved = false;
  }
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
  syncContinueUi();
  show('gameover');
});

$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});

$('#name-input').addEventListener('blur', saveName);

$('#btn-again').addEventListener('click', () => {
  sfx.ui();
  saveName();
  startGame();
});

$('#btn-menu').addEventListener('click', () => {
  sfx.uiBack();
  saveName();
  game.quitToMenu();
  renderBest();
  syncContinueUi();
  show('menu');
});

/* -------------------------------------------------------------- hud extras -- */

let nameSaved = false;

function saveName() {
  if (nameSaved) return;
  const input = $('#name-input');
  if (!nameLastScore(input.value)) return;
  nameSaved = true;
  input.blur();
  pushGlobalScore();
  $('#btn-save-name').textContent = 'Saved';
  sfx.pickup();
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
  }, 1600);
}

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

/* ------------------------------------------------------------ arcade bridge -- */

/*
 * When the game runs inside a game-page iframe, the page's sound button sends
 * this message. It flips both sound and music together.
 */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const msg = e.data;
  if (!msg || msg.type !== 'arcade:set-sound') return;
  settings.set('sound', !!msg.on);
  settings.set('music', !!msg.on);
  syncSettingsUi();
  syncMusicSetting(game.state !== 'attract' && game.state !== 'boot');
  if (msg.on && game.player) music.start(game.wave && game.wave.isBoss ? 'boss' : 'space');
});

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
    if (['playing', 'wave-intro', 'wave-clear', 'countdown'].includes(game.state)) {
      game.togglePause(true);
    }
    game.autosave();
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
syncDifficultyUi();
syncContinueUi();
renderBest();
show('menu');
game.startAttract();
