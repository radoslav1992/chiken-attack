/* Timber Tails boot: DOM shell, input, run state, saves, leaderboard, PWA. */

import { attachArcade, isEditing, postScore } from '../../shared/arcade.js';
import { Game, T } from './engine.js';
import { LEVELS, WORLDS } from './levels.js';
import { Renderer } from './render.js';
import { THEMES } from './sprites.js';
import { sfx, music, unlock, setSound, soundOn } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

const canvas = $('#game');
const stageEl = $('#stage');
const renderer = new Renderer(canvas);

/* ------------------------------------------------------------- persistence -- */

const SAVE_KEY = 'timber-tails.save';

function loadSave() {
  const blank = { v: 1, unlocked: 0, logs: {}, done: {}, best: 0, name: 'BEAVER', run: null };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return blank;
    const s = { ...blank, ...raw };
    s.unlocked = Math.max(0, Math.min(LEVELS.length - 1, Math.floor(Number(s.unlocked)) || 0));
    if (!s.logs || typeof s.logs !== 'object') s.logs = {};
    if (!s.done || typeof s.done !== 'object') s.done = {};
    s.best = Math.max(0, Math.floor(Number(s.best)) || 0);
    s.name = String(s.name || 'BEAVER').slice(0, 12);
    const r = s.run;
    if (
      !r ||
      typeof r !== 'object' ||
      !Number.isInteger(r.stage) ||
      r.stage < 0 ||
      r.stage >= LEVELS.length ||
      !(r.lives > 0)
    )
      s.run = null;
    return s;
  } catch {
    return blank;
  }
}
const save = loadSave();
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {}
}

const totalLogs = LEVELS.reduce((n, l) => n + l.logs.length, 0);
const bits = (mask) => {
  let n = 0;
  for (let m = mask | 0; m; m >>= 1) n += m & 1;
  return n;
};

/* -------------------------------------------------------------- run state -- */

let run = null; // { id, stage, score, lives, acorns, hearts, cones, cleared, logMask }
let game = null;
let mode = 'menu'; // menu | select | card | play | pause | clear | over
let frameNo = 0;
let camX = 0;
let look = 0;
let shake = 0;
let flash = 0;
let particles = [];
let popups = [];
let goldWas = false;
let cardTimer = 0;
let lastRun = null;

/** attachArcade listens here for the end of a run. */
const bus = {
  handlers: {},
  on(evt, fn) {
    (this.handlers[evt] ||= []).push(fn);
  },
  emit(evt, data) {
    (this.handlers[evt] || []).forEach((fn) => fn(data));
  },
};

function newRunId() {
  return globalThis.crypto?.randomUUID?.() ||
    `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function newRun(stage) {
  run = {
    id: newRunId(),
    stage,
    score: 0,
    lives: 3,
    acorns: 0,
    hearts: 3,
    cones: false,
    cleared: 0,
    logMask: 0,
  };
}

function storeRun() {
  save.run = { ...run, logMask: 0 };
  persist();
}

function beginStage(checkpoint) {
  const level = LEVELS[run.stage];
  game = new Game(level, {
    score: run.score,
    acorns: run.acorns,
    lives: run.lives,
    hearts: run.hearts,
    cones: run.cones,
    logs: run.logMask,
    checkpoint,
  });
  particles = [];
  popups = [];
  shake = 0;
  flash = 0;
  goldWas = false;
  look = 0;
  camX = clampCam(game.p.x - renderer.vw / 2);
  updateHud(true);
  $('#boss-bar').classList.add('is-hidden');
  showCard(level, !checkpoint);
}

function showCard(level, full) {
  mode = 'card';
  cardTimer = full ? 110 : 55;
  $('#card-world').textContent = `WORLD ${level.world} · ${WORLDS[level.world - 1].name.toUpperCase()}`;
  $('#card-title').textContent = `${level.id} ${level.name}`;
  $('#card-lives').textContent = `× ${run.lives}`;
  showOnly(null);
  $('#hud').classList.remove('is-hidden');
  $('#card').classList.remove('is-hidden');
  music.stop();
}

function startPlay() {
  mode = 'play';
  $('#card').classList.add('is-hidden');
  acc = 0;
  music.play(game.bossActive ? 'boss' : THEMES[game.level.theme].music);
}

/* ---------------------------------------------------------------- screens -- */

const screens = ['menu', 'select', 'pause', 'clear', 'over'];
function showOnly(name) {
  for (const s of screens) $(`#screen-${s}`).classList.toggle('is-hidden', s !== name);
  if (name) $('#card').classList.add('is-hidden');
  const playing = !name;
  $('#pad').classList.toggle('is-hidden', !(playing && padWanted));
  document.body.classList.toggle('has-pad', playing && padWanted);
  resize();
}

function syncSound() {
  const label = soundOn() ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
  $('#btn-sound-2').textContent = label;
}

function toMenu() {
  mode = 'menu';
  music.stop();
  game = null;
  $('#hud').classList.add('is-hidden');
  const cleared = Object.keys(save.done).length;
  const logs = Object.values(save.logs).reduce((n, m) => n + bits(m), 0);
  const play = $('#btn-play');
  if (save.run) play.textContent = `▶ CONTINUE ${LEVELS[save.run.stage].id}`;
  else if (save.unlocked > 0) play.textContent = `▶ PLAY ${LEVELS[save.unlocked].id}`;
  else play.textContent = '▶ PLAY';
  $('#menu-progress').textContent =
    cleared || save.best
      ? `Stages ${cleared}/${LEVELS.length} · Golden logs ${logs}/${totalLogs} · Best ${fmt(save.best)}`
      : 'Eight worlds between Pip and the lodge.';
  showOnly('menu');
}

function openSelect() {
  mode = 'select';
  const list = $('#world-list');
  list.textContent = '';
  WORLDS.forEach((world, w) => {
    const row = document.createElement('div');
    row.className = 'world-row';
    const name = document.createElement('div');
    name.className = 'world-name';
    name.textContent = world.name;
    const small = document.createElement('small');
    small.textContent = `World ${w + 1}`;
    name.append(small);
    row.append(name);
    for (let s = 0; s < 4; s++) {
      const i = w * 4 + s;
      const level = LEVELS[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-btn';
      if (s === 3) b.classList.add('is-boss');
      if (save.done[level.id]) b.classList.add('is-done');
      b.disabled = i > save.unlocked;
      b.textContent = level.id;
      const got = document.createElement('small');
      got.textContent = b.disabled ? 'locked' : `${bits(save.logs[level.id])}/${level.logs.length} logs`;
      b.append(got);
      b.setAttribute(
        'aria-label',
        `${level.id} ${level.name}${b.disabled ? ', locked' : save.done[level.id] ? ', cleared' : ''}`,
      );
      b.addEventListener('click', () => {
        sfx.ui();
        unlock();
        newRun(i);
        storeRun();
        beginStage(null);
      });
      row.append(b);
    }
    list.append(row);
  });
  showOnly('select');
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  music.stop();
  releaseAll();
  $('#pause-stage').textContent = `${game.level.id} ${game.level.name} · × ${game.lives}`;
  showOnly('pause');
}
function resume() {
  if (mode !== 'pause') return;
  showOnly(null);
  startPlay();
}

/* ------------------------------------------------------------- transitions -- */

function onDeath() {
  run.score = game.score;
  run.acorns = game.acorns;
  run.lives = game.lives - 1;
  run.logMask = game.logs;
  run.hearts = 3;
  run.cones = false;
  if (run.lives <= 0) return endRun(false);
  beginStage(game.checkpoint);
}

function onClear() {
  const level = game.level;
  const timeBonus = Math.ceil(game.timeLeft / 60) * 10;
  const heartBonus = game.p.hearts * 200;
  run.score = game.score + timeBonus + heartBonus;
  run.acorns = game.acorns;
  run.lives = game.lives;
  run.hearts = game.p.hearts;
  run.cones = game.p.cones;
  run.cleared++;
  save.logs[level.id] = (save.logs[level.id] || 0) | game.logs;
  save.done[level.id] = 1;
  const last = run.stage === LEVELS.length - 1;
  if (!last) {
    save.unlocked = Math.max(save.unlocked, run.stage + 1);
    run.stage++;
    run.logMask = 0;
    storeRun();
  } else persist();
  mode = 'clear';
  music.stop();
  releaseAll();
  $('#clear-kicker').textContent = level.arena ? 'BRISTLE BEATEN' : 'STAGE CLEAR';
  $('#clear-title').textContent = `${level.id} ${level.name}`;
  $('#clear-time').textContent = `+${fmt(timeBonus)}`;
  $('#clear-hearts').textContent = `+${fmt(heartBonus)}`;
  $('#clear-logs').textContent = `${bits(game.logs)}/${level.logs.length}`;
  $('#clear-score').textContent = fmt(run.score);
  $('#btn-next').textContent = last ? 'FINISH ▶' : 'NEXT STAGE ▶';
  $('#btn-next').dataset.last = last ? '1' : '';
  showOnly('clear');
  $('#btn-next').focus({ preventScroll: true });
}

let nameSaved = false;
function endRun(won) {
  mode = 'over';
  music.stop();
  releaseAll();
  const score = Math.floor(run.score);
  const stageAt = run.stage;
  save.best = Math.max(save.best, score);
  save.run = null;
  persist();
  $('#over-title').textContent = won ? 'HOME AT LAST' : 'OUT OF LIVES';
  $('#over-note').textContent = won
    ? 'King Bristle is in the millpond and the lodge has its kit back. All thirty-two stages, done.'
    : `The trail ended at ${LEVELS[stageAt].id} ${LEVELS[stageAt].name}. Every stage you opened stays open.`;
  $('#over-score').textContent = fmt(score);
  $('#over-stages').textContent = String(run.cleared);
  $('#over-acorns').textContent = fmt(run.acorns);
  $('#over-best').textContent = fmt(save.best);
  $('#name-input').value = save.name;
  $('#btn-again').textContent = won ? '▶ PLAY AGAIN' : `▶ RETRY ${LEVELS[stageAt].id}`;
  $('#btn-again').dataset.stage = String(won ? 0 : stageAt);
  nameSaved = false;
  if (!won) sfx.over();
  else sfx.bossdown();
  $('#hud').classList.add('is-hidden');
  showOnly('over');
  bus.emit('gameover', { score });
  lastRun =
    score > 0
      ? { id: run.id, game: 'timber-tails', score, wave: run.cleared, difficulty: 'veteran' }
      : null;
  if (lastRun) postScore(lastRun, save.name);
  game = null;
}

function saveName() {
  if (nameSaved) return;
  const clean = $('#name-input')
    .value.toUpperCase()
    .replace(/[^A-Z0-9 .\-_]/g, '')
    .trim()
    .slice(0, 12);
  if (!clean) return;
  save.name = clean;
  persist();
  nameSaved = true;
  $('#btn-save-name').textContent = 'Saved';
  if (lastRun) postScore(lastRun, clean);
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
    nameSaved = false;
  }, 1500);
}

/* ------------------------------------------------------------------ input -- */

const held = { left: false, right: false, jump: false, down: false, action: false };
const prev = { jump: false, down: false, action: false };
const keysDown = new Set();
const touch = { left: false, right: false, jump: false, down: false, action: false };
const padState = { left: false, right: false, jump: false, down: false, action: false, start: false };

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  KeyZ: 'jump',
  ArrowUp: 'jump',
  KeyW: 'jump',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyX: 'action',
  KeyK: 'action',
  ShiftLeft: 'action',
  ShiftRight: 'action',
};

function releaseAll() {
  keysDown.clear();
  for (const k of Object.keys(touch)) touch[k] = false;
  document.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
  prev.jump = prev.down = prev.action = true;
}

window.addEventListener('keydown', (e) => {
  if (isEditing(e.target)) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'play') pause();
    else if (mode === 'pause') resume();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyM' && !e.repeat) {
    setSound(!soundOn());
    syncSound();
    return;
  }
  if (mode === 'card' && (e.code === 'Space' || e.code === 'Enter') && cardTimer > 20) cardTimer = 20;
  if (KEYMAP[e.code]) {
    if (mode === 'play' || mode === 'card') e.preventDefault();
    keysDown.add(e.code);
  }
});
window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

let padWanted = false;
function wantPad() {
  if (padWanted) return;
  padWanted = true;
  if (mode === 'play' || mode === 'card') showOnly(null);
}
if (window.matchMedia?.('(pointer: coarse)').matches) padWanted = true;
window.addEventListener('touchstart', wantPad, { passive: true });

/* Capture keeps a thumb that slides off a button from dropping the input. */
function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {}
}

const moveEl = $('#pad-move');
let movePointer = null;
function moveFrom(e) {
  const rect = moveEl.getBoundingClientRect();
  const x = e.clientX - (rect.left + rect.width / 2);
  touch.left = x < -4;
  touch.right = x > 4;
  moveEl.querySelector('[data-dir="left"]').classList.toggle('is-down', touch.left);
  moveEl.querySelector('[data-dir="right"]').classList.toggle('is-down', touch.right);
}
moveEl.addEventListener('pointerdown', (e) => {
  movePointer = e.pointerId;
  capture(moveEl, e);
  moveFrom(e);
  e.preventDefault();
});
moveEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === movePointer) moveFrom(e);
});
const moveEnd = (e) => {
  if (e.pointerId !== movePointer) return;
  movePointer = null;
  touch.left = touch.right = false;
  moveEl.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
};
moveEl.addEventListener('pointerup', moveEnd);
moveEl.addEventListener('pointercancel', moveEnd);

document.querySelectorAll('.pad-btn').forEach((btn) => {
  const key = btn.dataset.btn;
  const set = (on) => (e) => {
    touch[key] = on;
    btn.classList.toggle('is-down', on);
    if (on) capture(btn, e);
    e.preventDefault();
  };
  btn.addEventListener('pointerdown', set(true));
  btn.addEventListener('pointerup', set(false));
  btn.addEventListener('pointercancel', set(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let any = false;
  const st = { left: false, right: false, jump: false, down: false, action: false, start: false };
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    any = true;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] || 0,
      ay = gp.axes[1] || 0;
    st.left ||= ax < -0.4 || b(14);
    st.right ||= ax > 0.4 || b(15);
    st.down ||= ay > 0.6 || b(13);
    st.jump ||= b(0) || b(3);
    st.action ||= b(1) || b(2);
    st.start ||= b(9);
  }
  if (any && st.start && !padState.start) mode === 'play' ? pause() : mode === 'pause' ? resume() : 0;
  Object.assign(padState, st);
}

function readInput() {
  pollGamepad();
  for (const k of Object.keys(held)) held[k] = touch[k] || padState[k];
  for (const code of keysDown) held[KEYMAP[code]] = true;
  const inp = {
    left: held.left,
    right: held.right,
    jump: held.jump,
    down: held.down,
    action: held.action,
    jumpPressed: held.jump && !prev.jump,
    downPressed: held.down && !prev.down,
    actionPressed: held.action && !prev.action,
  };
  prev.jump = held.jump;
  prev.down = held.down;
  prev.action = held.action;
  return inp;
}

/* -------------------------------------------------------------------- hud -- */

const hud = {
  hearts: $('#hud-hearts'),
  lives: $('#hud-lives'),
  acorns: $('#hud-acorns'),
  logs: $('#hud-logs'),
  stage: $('#hud-stage'),
  time: $('#hud-time'),
  score: $('#hud-score'),
};
const shown = {};
function setText(el, key, value) {
  if (shown[key] === value) return;
  shown[key] = value;
  el.textContent = value;
}
function updateHud(force) {
  if (!game) return;
  if (force) for (const k of Object.keys(shown)) delete shown[k];
  const p = game.p;
  if (shown.hearts !== p.hearts) {
    shown.hearts = p.hearts;
    [...hud.hearts.children].forEach((el, i) => el.classList.toggle('is-empty', i >= p.hearts));
    hud.hearts.setAttribute('aria-label', `${p.hearts} hearts`);
  }
  setText(hud.lives, 'lives', String(game.lives));
  setText(hud.acorns, 'acorns', String(game.acorns));
  setText(hud.logs, 'logs', `${bits(game.logs)}/${game.level.logs.length}`);
  setText(hud.stage, 'stage', game.level.id);
  const secs = Math.max(0, Math.ceil(game.timeLeft / 60));
  setText(hud.time, 'time', String(secs));
  hud.time.parentElement.classList.toggle('is-low', secs <= 30);
  setText(hud.score, 'score', fmt(game.score));
  $('.pad-b').classList.toggle('is-off', !p.cones);
  if (game.boss && game.bossActive) {
    $('#boss-bar').classList.remove('is-hidden');
    const pct = `${Math.max(0, (game.boss.hp / game.boss.maxHp) * 100)}%`;
    if (shown.boss !== pct) {
      shown.boss = pct;
      $('#boss-fill').style.width = pct;
    }
  } else if (game.bossDead) $('#boss-bar').classList.add('is-hidden');
}

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('is-live');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-live'), 1900);
}

/* ---------------------------------------------------------------- effects -- */

function burst(x, y, n, cols, speed = 1.6, grav = 0.12, life = 26, size = 2) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - speed * 0.5,
      g: grav,
      life: life * (0.6 + Math.random() * 0.6),
      col: cols[i % cols.length],
      size,
    });
  }
}
function dust(x, y, n = 4) {
  for (let i = 0; i < n; i++)
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - 2,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -Math.random() * 0.6,
      g: 0,
      life: 14 + Math.random() * 8,
      col: '#e9e2cf',
      size: 2,
    });
}

const HINTS = {
  power: 'Pinecones! Throw with X or ●',
  gold: 'Golden acorn — nothing can touch you',
  check: 'Checkpoint',
  log: 'Golden log',
};

function handle(ev) {
  const th = THEMES[game.level.theme];
  switch (ev.type) {
    case 'pop':
      popups.push({ x: ev.x, y: ev.y - 6, text: ev.text, life: 44 });
      break;
    case 'jump':
      sfx.jump();
      break;
    case 'land':
      dust(ev.x, ev.y, 3);
      sfx.land();
      break;
    case 'dive':
      sfx.dive();
      break;
    case 'slam':
      sfx.slam();
      shake = 7;
      dust(ev.x - 10, ev.y, 5);
      dust(ev.x + 10, ev.y, 5);
      break;
    case 'acorn':
      sfx.acorn();
      burst(ev.x, ev.y, 4, ['#fad793', '#ffffff'], 1, 0.02, 14, 1);
      break;
    case 'coinpop':
      particles.push({ x: ev.x - 2, y: ev.y, vx: 0, vy: -2.6, g: 0.16, life: 24, col: '#e6a64c', size: 4 });
      break;
    case 'bump':
      renderer.bump(ev.c, ev.r);
      sfx.bump();
      break;
    case 'thud':
      sfx.bump();
      break;
    case 'break':
      sfx.break();
      burst(ev.x, ev.y, 8, ['#c08a4e', '#7a4c20', '#e0b070'], 2.4, 0.2, 30, 3);
      break;
    case 'sprout':
      sfx.sprout();
      break;
    case 'stomp':
      sfx.stomp();
      break;
    case 'defeat':
      sfx.defeat();
      burst(ev.x, ev.y, 6, ['#ffffff', '#ffe27a'], 1.4, 0.05, 16, 2);
      break;
    case 'berry':
      sfx.berry();
      burst(ev.x, ev.y, 6, ['#ff9a8a', '#e2473b'], 1.2, 0.04, 18, 2);
      break;
    case 'power':
      sfx.power();
      toast(HINTS.power);
      break;
    case 'gold':
      sfx.gold();
      toast(HINTS.gold);
      break;
    case 'life':
      sfx.life();
      popups.push({ x: ev.x, y: ev.y - 10, text: '1UP', life: 70, col: '#a8f5b8' });
      break;
    case 'log':
      sfx.log();
      burst(ev.x, ev.y, 14, ['#ffd23a', '#fff6c0'], 2, 0.03, 30, 2);
      toast(`${HINTS.log} ${bits(game.logs)}/${game.level.logs.length}`);
      break;
    case 'hurt':
      sfx.hurt();
      shake = 5;
      break;
    case 'die':
      sfx.die();
      music.stop();
      break;
    case 'splash':
      sfx.splash();
      music.stop();
      burst(ev.x, ev.y + 6, 16, th.liquid, 2.6, 0.2, 28, 2);
      break;
    case 'check':
      sfx.check();
      toast(HINTS.check);
      burst(ev.x, ev.y - 8, 8, ['#e2473b', '#ffffff'], 1.4, 0.05, 20, 2);
      break;
    case 'clear':
      sfx.clear();
      burst(ev.x, ev.y, 20, ['#ffd98a', '#ffffff', '#c7ee85'], 2.4, 0.05, 40, 2);
      break;
    case 'boing':
      renderer.boing(Math.floor(ev.x / T), Math.floor(ev.y / T));
      sfx.boing();
      break;
    case 'throw':
      sfx.throw();
      break;
    case 'puff':
      sfx.puff();
      burst(ev.x, ev.y, 4, ['#e9e2cf'], 0.9, 0, 12, 2);
      break;
    case 'crumble':
      sfx.crumble();
      burst(ev.x, ev.y, 6, ['#a67c50', '#5a3c1e'], 1, 0.25, 30, 3);
      break;
    case 'shatter':
      sfx.shatter();
      burst(ev.x, ev.y, 8, ['#bfe9ff', '#ffffff'], 1.8, 0.15, 20, 2);
      break;
    case 'whoosh':
      sfx.whoosh();
      break;
    case 'clang':
      sfx.clang();
      break;
    case 'crash':
      sfx.crash();
      shake = 9;
      dust(ev.x, ev.y, 8);
      break;
    case 'snort':
      sfx.snort();
      break;
    case 'leap':
      sfx.leap();
      break;
    case 'bosshit':
      sfx.bosshit();
      flash = 8;
      shake = 6;
      break;
    case 'bossdown':
      sfx.bossdown();
      flash = 14;
      burst(ev.x, ev.y, 30, ['#ffffff', '#ffd23a', '#ff9a8a'], 3, 0.06, 50, 3);
      toast('The door is open');
      music.play(THEMES[game.level.theme].music);
      break;
    case 'bossstart':
      $('#boss-name').textContent = game.level.world === 8 ? 'KING BRISTLE' : 'BRISTLE';
      music.play('boss');
      toast('Wait for him to hit the wall. Then land on him.');
      break;
  }
}

function clampCam(x) {
  const vw = renderer.vw;
  const max = game.w * T - vw;
  if (game.bossActive && game.arena) {
    const lo = (game.arena.x0 - 2) * T,
      hi = (game.arena.x1 + 2) * T - vw;
    if (hi < lo) return (lo + hi) / 2;
    return Math.max(lo, Math.min(hi, x));
  }
  return Math.max(0, Math.min(max, x));
}

/* ------------------------------------------------------------------- loop -- */

const STEP = 1 / 60;
let acc = 0;
let lastTime = 0;

function tick() {
  frameNo++;
  const inp = readInput();
  game.step(inp);
  for (const ev of game.events) handle(ev);
  game.events.length = 0;

  const p = game.p;
  const gold = p.gold > 0;
  if (gold !== goldWas) {
    music.hurry(gold);
    goldWas = gold;
  }
  if (!p.dead) {
    look += (p.face * 26 - look) * 0.05;
    const target = clampCam(p.x + 5 - renderer.vw / 2 + look);
    camX += (target - camX) * (game.bossActive ? 0.08 : 0.16);
  }
  stepEffects();
  if (frameNo % 6 === 0) updateHud();
  if (game.state === 'dead') onDeath();
  else if (game.state === 'clear') {
    updateHud();
    onClear();
  }
}

function stepEffects() {
  for (const q of particles) {
    q.x += q.vx;
    q.y += q.vy;
    q.vy += q.g;
    q.life--;
  }
  particles = particles.filter((q) => q.life > 0);
  for (const q of popups) {
    q.y -= 0.5;
    q.life--;
  }
  popups = popups.filter((q) => q.life > 0);
  if (shake > 0) shake -= 0.5;
  if (flash > 0) flash--;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (mode === 'play') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && mode === 'play' && guard++ < 6) {
      tick();
      acc -= STEP;
    }
  } else if (mode === 'card') {
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      frameNo++;
      if (--cardTimer <= 0) {
        startPlay();
        break;
      }
    }
  } else if (mode === 'clear' || mode === 'pause') {
    if (mode === 'clear') {
      frameNo++;
      stepEffects();
    }
  }
  if (game) renderer.draw(game, { camX, shake, flash, t: frameNo, particles, popups });
}

function resize() {
  const rect = stageEl.getBoundingClientRect();
  const W = rect.width,
    H = rect.height;
  if (W < 10 || H < 10) return;
  let scale = H / 240;
  let vw = Math.round(W / scale);
  if (vw < 256) {
    vw = 256;
    scale = W / 256;
  }
  if (vw > 448) vw = 448;
  vw -= vw % 2;
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.min(4, Math.ceil(scale * dpr - 0.01)));
  if (vw !== renderer.vw || k !== renderer.k || canvas.width !== vw * k) renderer.resize(vw, k);
  canvas.style.width = `${Math.round(vw * scale)}px`;
  canvas.style.height = `${Math.round(240 * scale)}px`;
  if (game) camX = clampCam(camX);
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(stageEl);

/* ---------------------------------------------------------------- buttons -- */

$('#btn-play').addEventListener('click', () => {
  unlock();
  sfx.ui();
  if (save.run) run = { ...save.run, logMask: 0 };
  else {
    newRun(save.unlocked);
    storeRun();
  }
  beginStage(null);
});
$('#btn-select').addEventListener('click', () => {
  sfx.ui();
  openSelect();
});
$('#btn-select-back').addEventListener('click', () => {
  sfx.ui();
  toMenu();
});
$('#btn-pause').addEventListener('click', () => {
  sfx.ui();
  $('#btn-pause').blur(); // or the next press of Space would click it again
  pause();
});
$('#btn-resume').addEventListener('click', () => {
  sfx.ui();
  resume();
});
$('#btn-restart').addEventListener('click', () => {
  sfx.ui();
  showOnly(null);
  game.checkpoint = null;
  onDeath();
});
$('#btn-quit').addEventListener('click', () => {
  sfx.ui();
  toMenu();
});
$('#btn-next').addEventListener('click', () => {
  sfx.ui();
  if ($('#btn-next').dataset.last) endRun(true);
  else beginStage(null);
});
$('#btn-again').addEventListener('click', () => {
  unlock();
  sfx.ui();
  newRun(Number($('#btn-again').dataset.stage) || 0);
  storeRun();
  beginStage(null);
});
$('#btn-over-menu').addEventListener('click', () => {
  sfx.ui();
  toMenu();
});
[$('#btn-sound'), $('#btn-sound-2')].forEach((btn) =>
  btn.addEventListener('click', () => {
    setSound(!soundOn());
    syncSound();
    sfx.ui();
  }),
);
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});
$('#card').addEventListener('pointerdown', () => {
  if (cardTimer > 20) cardTimer = 20;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('blur', () => pause());

/* The arcade game page's sound button reaches in here. */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const msg = e.data;
  if (!msg || msg.type !== 'arcade:set-sound') return;
  setSound(!!msg.on);
  syncSound();
});

['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => unlock(), { once: true, passive: true }),
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* -------------------------------------------------------------------- boot -- */

attachArcade(bus, { slug: 'timber-tails', title: 'Timber Tails', resultSelector: '#screen-over .panel' });
syncSound();
toMenu();
requestAnimationFrame(frame);

/* A handle for the browser tests; nothing in the game reads it. */
window.__timber = {
  get game() {
    return game;
  },
  get mode() {
    return mode;
  },
  get run() {
    return run;
  },
  start(stage) {
    newRun(stage);
    beginStage(null);
    cardTimer = 1;
  },
  LEVELS,
};
