/*
 * Freedoom in the browser — the page side.
 *
 * The game itself is engine/freedoom.wasm: Crispy Doom, compiled for the web
 * (see licenses/SOURCE.txt). It knows nothing about browsers. Everything it
 * needs from one goes through the `Module` object below:
 *
 *   it calls us   webPresent (a frame), webSfx* (sound effects), webEvent
 *                 (level finished, player died), quit
 *   we call it    _web_main (start), _web_key / _web_mouse_* (input),
 *                 _web_opl_render (the next block of music), _web_wants_mouse
 *
 * This file is the arcade's own code. The engine and the game data have their
 * own licences; see the Credits section on the start screen.
 */

import { attachArcade, isEditing, postScore } from '../../shared/arcade.js';
import { levelScore, deathScore } from './score.js';

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

const canvas = $('#screen');
const ctx2d = canvas.getContext('2d');
const stageEl = $('#stage');

let M = null; // the Emscripten module, once it exists
let running = false;
let padWanted = window.matchMedia?.('(pointer: coarse)').matches || false;

/* ------------------------------------------------------------------ sound -- */

let soundOn = true;
try {
  soundOn = localStorage.getItem('freedoom.sound') !== 'off';
} catch {}

let audio = null;
let master = null;
const buffers = new Map(); // lump number -> decoded AudioBuffer
const channels = []; // what each of the engine's sound channels is playing

function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audio) {
    try {
      audio = new AC({ sampleRate: 44100 });
    } catch {
      audio = new AC();
    }
    master = audio.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}

function setSound(on) {
  soundOn = !!on;
  try {
    localStorage.setItem('freedoom.sound', soundOn ? 'on' : 'off');
  } catch {}
  if (master) master.gain.value = soundOn ? 1 : 0;
  const label = soundOn ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
  $('#btn-sound-menu').textContent = label;
}

/* A sound lump is: format (3), sample rate, length, then 8-bit samples with
 * 16 bytes of padding at each end. Decoded once, then kept. */
function decodeSfx(ptr, len) {
  const heap = M.HEAPU8;
  if (heap[ptr] !== 3 || heap[ptr + 1] !== 0) return null;
  const rate = heap[ptr + 2] | (heap[ptr + 3] << 8) || 11025;
  let count = (heap[ptr + 4] | (heap[ptr + 5] << 8) | (heap[ptr + 6] << 16) | (heap[ptr + 7] << 24)) >>> 0;
  count = Math.min(count, len - 8);
  let start = ptr + 8;
  if (count > 32) {
    start += 16;
    count -= 32;
  }
  if (count < 1) return null;
  /* Some browsers refuse buffers slower than 22.05 kHz; repeat samples to get there. */
  let repeat = 1;
  while (rate * repeat < 22050) repeat *= 2;
  const buf = audio.createBuffer(1, count * repeat, rate * repeat);
  const out = buf.getChannelData(0);
  for (let i = 0; i < count; i++) {
    const v = (heap[start + i] - 128) / 128;
    for (let r = 0; r < repeat; r++) out[i * repeat + r] = v;
  }
  return buf;
}

function applyParams(ch, vol, sep) {
  ch.gain.gain.value = Math.max(0, Math.min(1, vol / 127)) * 0.8;
  if (ch.pan) ch.pan.pan.value = Math.max(-1, Math.min(1, (sep - 128) / 127));
}

function sfxStop(channel) {
  const ch = channels[channel];
  if (!ch) return;
  channels[channel] = null;
  try {
    ch.src.stop();
  } catch {}
}

function sfxStart(channel, lump, ptr, len, vol, sep) {
  if (!audio || audio.state !== 'running') return;
  let buf = buffers.get(lump);
  if (buf === undefined) {
    buf = decodeSfx(ptr, len);
    buffers.set(lump, buf);
  }
  if (!buf) return;
  sfxStop(channel);
  const src = audio.createBufferSource();
  src.buffer = buf;
  const gain = audio.createGain();
  const pan = audio.createStereoPanner ? audio.createStereoPanner() : null;
  src.connect(gain);
  if (pan) gain.connect(pan).connect(master);
  else gain.connect(master);
  const ch = { src, gain, pan };
  applyParams(ch, vol, sep);
  src.onended = () => {
    if (channels[channel] === ch) channels[channel] = null;
  };
  src.start();
  channels[channel] = ch;
}

/* Music: the engine emulates an FM synthesiser chip; we ask it for sound a
 * block at a time and play what comes back. */
function startMusic() {
  if (!audio || !audio.createScriptProcessor) return;
  const FRAMES = 2048;
  const ptr = M._malloc(FRAMES * 4);
  const node = audio.createScriptProcessor(FRAMES, 0, 2);
  node.onaudioprocess = (e) => {
    const left = e.outputBuffer.getChannelData(0);
    const right = e.outputBuffer.getChannelData(1);
    let got = 0;
    if (running) {
      try {
        got = M._web_opl_render(ptr, left.length);
      } catch {
        got = 0;
      }
    }
    if (got > 0) {
      const pcm = new Int16Array(M.HEAPU8.buffer, ptr, got * 2);
      for (let i = 0; i < got; i++) {
        left[i] = (pcm[i * 2] / 32768) * 0.6;
        right[i] = (pcm[i * 2 + 1] / 32768) * 0.6;
      }
    }
    for (let i = got; i < left.length; i++) left[i] = right[i] = 0;
  };
  node.connect(master);
}

/* ------------------------------------------------------------------ video -- */

let image = null;
let imageKey = '';
let aspect = [4, 3];

function layout() {
  const rect = stageEl.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  const scale = Math.min(rect.width / aspect[0], rect.height / aspect[1]);
  canvas.style.width = `${Math.floor(aspect[0] * scale)}px`;
  canvas.style.height = `${Math.floor(aspect[1] * scale)}px`;
}

function present(ptr, w, h, aw, ah) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (aspect[0] !== aw || aspect[1] !== ah) {
    aspect = [aw, ah];
    layout();
  }
  /* The picture is read straight out of the engine's memory. That memory is
   * replaced when it grows, so the view onto it has to be remade then. */
  const buffer = M.HEAPU8.buffer;
  const key = `${ptr}:${w}:${h}:${buffer.byteLength}`;
  if (!image || imageKey !== key || image.data.buffer !== buffer) {
    image = new ImageData(new Uint8ClampedArray(buffer, ptr, w * h * 4), w, h);
    imageKey = key;
  }
  ctx2d.putImageData(image, 0, 0);
}

window.addEventListener('resize', layout);
if (window.ResizeObserver) new ResizeObserver(layout).observe(stageEl);

/* ------------------------------------------------------------------ input -- */

const K = {
  RIGHT: 0xae,
  LEFT: 0xac,
  UP: 0xad,
  DOWN: 0xaf,
  ESC: 27,
  ENTER: 13,
  TAB: 9,
  BACKSPACE: 0x7f,
  PAUSE: 0xff,
  SHIFT: 0x80 + 0x36,
  FIRE: 0x80 + 0x1d,
  ALT: 0x80 + 0x38,
  USE: 32,
  STRAFE_L: 44, // ,
  STRAFE_R: 46, // .
};

/* Browser key -> the engine's own key numbers. */
const CODES = {
  ArrowRight: K.RIGHT,
  ArrowLeft: K.LEFT,
  ArrowUp: K.UP,
  ArrowDown: K.DOWN,
  Escape: K.ESC,
  Enter: K.ENTER,
  NumpadEnter: K.ENTER,
  Tab: K.TAB,
  Backspace: K.BACKSPACE,
  Pause: K.PAUSE,
  ShiftLeft: K.SHIFT,
  ShiftRight: K.SHIFT,
  AltLeft: K.ALT,
  AltRight: K.ALT,
  Space: 32,
  Minus: 0x2d,
  Equal: 0x3d,
  Comma: 44,
  Period: 46,
  Slash: 47,
  Semicolon: 59,
  Quote: 39,
  BracketLeft: 91,
  BracketRight: 93,
  Backslash: 92,
  Backquote: 96,
  CapsLock: 0x80 + 0x3a,
  Home: 0x80 + 0x47,
  End: 0x80 + 0x4f,
  PageUp: 0x80 + 0x49,
  PageDown: 0x80 + 0x51,
  Insert: 0x80 + 0x52,
  Delete: 0x80 + 0x53,
};
for (let i = 0; i < 26; i++) CODES[`Key${String.fromCharCode(65 + i)}`] = 97 + i;
for (let i = 0; i < 10; i++) {
  CODES[`Digit${i}`] = 48 + i;
  CODES[`Numpad${i}`] = 48 + i;
}
for (let i = 1; i <= 10; i++) CODES[`F${i}`] = 0x80 + 0x3a + i;
CODES.F11 = 0x80 + 0x57;
CODES.F12 = 0x80 + 0x58;

/* While playing, WASD stands in for the engine's default keys. In a menu or
 * while naming a save the letters are just letters.
 *
 * Fire is F rather than Ctrl on purpose: Ctrl+W closes the tab and no page
 * can stop it, which is a poor thing to have happen mid-firefight. */
const IN_GAME = {
  KeyW: K.UP,
  KeyS: K.DOWN,
  KeyA: K.STRAFE_L,
  KeyD: K.STRAFE_R,
  KeyE: K.USE,
  KeyF: K.FIRE,
};

const wantsMouse = () => running && M._web_wants_mouse() === 1;

const held = new Map(); // source id -> engine key currently down because of it

function press(id, key, typed = 0) {
  if (!running || !key || held.has(id)) return;
  held.set(id, key);
  M._web_key(1, key, typed);
}
function release(id) {
  const key = held.get(id);
  if (key === undefined) return;
  held.delete(id);
  if (running) M._web_key(0, key, 0);
}
function tap(key) {
  if (!running) return;
  M._web_key(1, key, 0);
  setTimeout(() => running && M._web_key(0, key, 0), 60);
}
function releaseAll() {
  for (const id of [...held.keys()]) release(id);
  if (running) M._web_release_mouse();
  document.querySelectorAll('.is-down').forEach((el) => el.classList.remove('is-down'));
}

window.addEventListener('keydown', (e) => {
  if (!running || isEditing(e.target) || e.metaKey || e.ctrlKey) return;
  const playing = wantsMouse();
  const key = (playing && IN_GAME[e.code]) || CODES[e.code];
  if (!key) return;
  e.preventDefault();
  if (e.repeat) {
    /* menus want held arrows to repeat; the game itself must not see repeats */
    if (!playing) M._web_key(1, key, e.key.length === 1 ? e.key.charCodeAt(0) : 0);
    return;
  }
  press(`k:${e.code}`, key, !playing && e.key.length === 1 ? e.key.charCodeAt(0) : 0);
});
window.addEventListener('keyup', (e) => {
  if (held.has(`k:${e.code}`)) e.preventDefault();
  release(`k:${e.code}`);
});

/* Mouse: captured on click, released by the browser on Esc. The browser eats
 * that Esc, so we hand the engine one of our own — otherwise the game would
 * carry on with nobody steering. */
const locked = () => document.pointerLockElement === canvas;
canvas.addEventListener('click', () => {
  if (running && !padWanted && !locked()) canvas.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  if (!locked()) {
    if (running) M._web_release_mouse();
    if (wantsMouse() && !overOpen) tap(K.ESC);
  }
  updateHint();
});
document.addEventListener('mousemove', (e) => {
  if (running && locked()) M._web_mouse_move(e.movementX, e.movementY);
});
const BUTTONS = [0, 2, 1]; // browser left/middle/right -> engine fire/forward/strafe
canvas.addEventListener('mousedown', (e) => {
  if (running && locked() && e.button < 3) M._web_mouse_button(BUTTONS[e.button], 1);
});
window.addEventListener('mouseup', (e) => {
  if (running && e.button < 3) M._web_mouse_button(BUTTONS[e.button], 0);
});
function wheelWeapon(next) {
  if (!running) return;
  const button = next ? 3 : 4;
  M._web_mouse_button(button, 1);
  M._web_mouse_button(button, 0);
}
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!running) return;
    e.preventDefault();
    wheelWeapon(e.deltaY < 0);
  },
  { passive: false },
);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* Touch. A stick for the feet, a drag area for turning, buttons for the rest. */
function capture(el, e) {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {}
}

const PAD_KEYS = {
  fire: K.FIRE,
  use: K.USE,
  up: K.UP,
  down: K.DOWN,
  left: K.LEFT,
  right: K.RIGHT,
  enter: K.ENTER,
  escape: K.ESC,
  yes: 121,
};

document.querySelectorAll('.pad-btn').forEach((btn) => {
  const down = (e) => {
    e.preventDefault();
    capture(btn, e);
    btn.classList.add('is-down');
    if (btn.dataset.tap) wheelWeapon(btn.dataset.tap === 'next');
    else press(`p:${btn.dataset.key}`, PAD_KEYS[btn.dataset.key]);
  };
  const up = (e) => {
    e.preventDefault();
    btn.classList.remove('is-down');
    if (btn.dataset.key) release(`p:${btn.dataset.key}`);
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

const stick = $('#stick');
const knob = $('#stick-knob');
let stickPointer = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  knob.style.left = `${50 + x * 30}%`;
  knob.style.top = `${50 + y * 30}%`;
  const want = { up: y < -0.33, down: y > 0.33, sl: x < -0.4, sr: x > 0.4 };
  const keys = { up: K.UP, down: K.DOWN, sl: K.STRAFE_L, sr: K.STRAFE_R };
  for (const dir of Object.keys(want)) {
    if (want[dir]) press(`s:${dir}`, keys[dir]);
    else release(`s:${dir}`);
  }
}
function stickEnd(e) {
  if (e.pointerId !== stickPointer) return;
  stickPointer = null;
  knob.style.left = knob.style.top = '50%';
  for (const dir of ['up', 'down', 'sl', 'sr']) release(`s:${dir}`);
}
stick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  stickPointer = e.pointerId;
  capture(stick, e);
  stickMove(e);
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickPointer) stickMove(e);
});
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);

const look = $('#look');
let lookPointer = null;
let lookX = 0;
look.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  lookPointer = e.pointerId;
  lookX = e.clientX;
  capture(look, e);
});
look.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookPointer || !running) return;
  const dx = e.clientX - lookX;
  lookX = e.clientX;
  M._web_mouse_move(Math.round(dx * 7), 0);
});
const lookEnd = (e) => {
  if (e.pointerId === lookPointer) lookPointer = null;
};
look.addEventListener('pointerup', lookEnd);
look.addEventListener('pointercancel', lookEnd);

window.addEventListener(
  'touchstart',
  () => {
    if (padWanted) return;
    padWanted = true;
    showPad();
  },
  { passive: true },
);

/* Gamepad: sticks and triggers become the same keys the keyboard sends. */
const GP = {
  buttons: [
    [7, K.FIRE],
    [5, K.FIRE],
    [0, K.USE],
    [12, K.UP],
    [13, K.DOWN],
    [14, K.LEFT],
    [15, K.RIGHT],
    [9, K.ESC],
    [1, K.ENTER],
  ],
  taps: [
    [2, false],
    [3, true],
  ],
  was: {},
};
function pollGamepad() {
  if (!running || !navigator.getGamepads) return;
  let gp = null;
  for (const g of navigator.getGamepads()) if (g && g.connected) gp = g;
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  for (const [i, key] of GP.buttons) {
    if (b(i)) press(`g:b${i}`, key);
    else release(`g:b${i}`);
  }
  for (const [i, next] of GP.taps) {
    if (b(i) && !GP.was[i]) wheelWeapon(next);
    GP.was[i] = b(i);
  }
  const ax = gp.axes;
  const axis = (id, on, key) => (on ? press(id, key) : release(id));
  axis('g:fwd', ax[1] < -0.45, K.UP);
  axis('g:back', ax[1] > 0.45, K.DOWN);
  axis('g:sl', ax[0] < -0.45, K.STRAFE_L);
  axis('g:sr', ax[0] > 0.45, K.STRAFE_R);
  const turn = ax[2] || 0;
  if (Math.abs(turn) > 0.15) M._web_mouse_move(Math.round(turn * 14), 0);
}

/* ---------------------------------------------------------- page furniture -- */

function showPad() {
  const on = running && padWanted;
  $('#pad').classList.toggle('is-hidden', !on);
  document.body.classList.toggle('has-pad', on);
  layout();
}

function updateHint() {
  const show = running && !padWanted && !locked() && wantsMouse() && !overOpen;
  $('#hint').classList.toggle('is-hidden', !show);
}

let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('is-live');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-live'), 2600);
}

function tick() {
  requestAnimationFrame(tick);
  pollGamepad();
}

/* The touch pad has two faces: one for playing, one for menus. */
setInterval(() => {
  if (!running) return;
  const playing = wantsMouse();
  $('#pad-play').classList.toggle('is-hidden', !playing);
  $('#pad-menu').classList.toggle('is-hidden', playing);
  updateHint();
}, 200);

/* ------------------------------------------------------------------ saves -- */

let syncing = false;
function syncSaves() {
  if (!M || syncing) return;
  syncing = true;
  try {
    M.FS.syncfs(false, () => {
      syncing = false;
    });
  } catch {
    syncing = false;
  }
}

/* Settings that suit a browser, written before the engine first reads its
 * config. The player's own changes after that are kept. */
function seedConfig(sampleRate) {
  const FS = M.FS;
  const read = (path) => {
    try {
      return FS.readFile(path, { encoding: 'utf8' });
    } catch {
      return null;
    }
  };
  let main = read('/save/default.cfg');
  if (main === null) main = 'joyb_speed                    29\n'; // always run
  main = main
    .split('\n')
    .filter((line) => !line.startsWith('snd_samplerate'))
    .join('\n');
  main += `${main.endsWith('\n') ? '' : '\n'}snd_samplerate                ${sampleRate}\n`;
  FS.writeFile('/save/default.cfg', main);
  if (read('/save/crispy-doom.cfg') === null)
    FS.writeFile('/save/crispy-doom.cfg', 'crispy_uncapped               1\ncrispy_widescreen             1\n');
}

/* ------------------------------------------------------------------ score -- */

const bus = {
  handlers: {},
  on(evt, fn) {
    (this.handlers[evt] ||= []).push(fn);
  },
  emit(evt, data) {
    (this.handlers[evt] || []).forEach((fn) => fn(data));
  },
};

let run = null;
let lastRun = null;
let overOpen = false;

const playerName = {
  get() {
    try {
      return localStorage.getItem('freedoom.name') || 'MARINE';
    } catch {
      return 'MARINE';
    }
  },
  set(v) {
    try {
      localStorage.setItem('freedoom.name', v);
    } catch {}
  },
};

function newRun() {
  run = {
    id:
      globalThis.crypto?.randomUUID?.() ||
      `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`,
    score: 0,
    levels: 0,
  };
}

function finishRun(won, map) {
  if (!run) return;
  const done = run;
  run = null;
  const score = Math.floor(done.score);
  $('#over-title').textContent = won ? 'ALL THIRTY LEVELS' : 'RUN OVER';
  $('#over-note').textContent = won
    ? 'You finished the game. That score goes on the board.'
    : `You fell on level ${map}. Press Use in the game to try the level again; the next run starts from zero.`;
  $('#over-score').textContent = fmt(score);
  $('#over-levels').textContent = String(done.levels);
  $('#name-input').value = playerName.get();
  bus.emit('gameover', { score });
  lastRun = score > 0 ? { id: done.id, game: 'freedoom', score, wave: done.levels, difficulty: 'veteran' } : null;
  if (lastRun) postScore(lastRun, playerName.get());
  if (score > 0 || won) {
    overOpen = true;
    document.exitPointerLock?.();
    releaseAll();
    $('#screen-over').classList.remove('is-hidden');
  }
}

function onEngineEvent(kind, a) {
  if (kind === 1 || kind === 2) {
    newRun();
  } else if (kind === 3) {
    if (!run) newRun();
    const [map, kills, totalKills, items, , secrets, , seconds, skill] = a;
    const points = levelScore({ kills, totalKills, items, secrets, seconds, skill });
    run.score += points;
    run.levels++;
    toast(`Level ${map} clear · +${fmt(points)} · run ${fmt(run.score)}`);
    syncSaves();
    if (map >= 30) finishRun(true, map);
  } else if (kind === 4) {
    if (!run) newRun();
    const [map, kills, skill] = a;
    run.score += deathScore({ kills, skill });
    finishRun(false, map);
  }
}

$('#btn-over-close').addEventListener('click', () => {
  overOpen = false;
  $('#screen-over').classList.add('is-hidden');
  canvas.focus?.();
});
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const clean = $('#name-input')
    .value.toUpperCase()
    .replace(/[^A-Z0-9 .\-_]/g, '')
    .trim()
    .slice(0, 12);
  if (!clean) return;
  playerName.set(clean);
  $('#btn-save-name').textContent = 'Saved';
  if (lastRun) postScore(lastRun, clean);
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
  }, 1500);
});

/* ---------------------------------------------------------------- loading -- */

const WAD_BYTES = 10933271; // size of data/freedoom2.wad.gz, for the progress bar

function setProgress(fraction, note) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  $('#progress-fill').style.width = `${pct}%`;
  $('#progress').setAttribute('aria-valuenow', String(pct));
  if (note) $('#load-note').textContent = note;
}

async function fetchGameData() {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('This browser is too old to unpack the game data. Any current browser will do.');
  const res = await fetch('data/freedoom2.wad.gz');
  if (!res.ok) throw new Error(`The game data did not download (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || WAD_BYTES;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    setProgress((got / total) * 0.9, `Downloading the game… ${(got / 1048576).toFixed(1)} MB`);
  }
  setProgress(0.93, 'Unpacking…');
  const unpacked = new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(unpacked).arrayBuffer());
}

const errLines = [];

function loadEngine() {
  return new Promise((resolve, reject) => {
    window.Module = {
      locateFile: (file) => `engine/${file}`,
      print: () => {},
      printErr: (text) => {
        errLines.push(String(text));
        if (errLines.length > 30) errLines.shift();
      },
      preRun: [
        () => {
          /* /save is kept in IndexedDB: config and savegames survive a reload */
          const mod = window.Module;
          mod.FS.mkdir('/save');
          mod.FS.mount(mod.IDBFS, {}, '/save');
          mod.addRunDependency('saves');
          mod.FS.syncfs(true, () => mod.removeRunDependency('saves'));
        },
      ],
      onRuntimeInitialized: () => resolve(window.Module),
      onAbort: (what) => {
        reject(new Error(String(what)));
        engineEnded(-1, String(what));
      },
      quit: (status, toThrow) => {
        engineEnded(status);
        throw toThrow;
      },
      webPresent: present,
      webTitle: () => {},
      webSfxStart: sfxStart,
      webSfxStop: sfxStop,
      webSfxParams: (channel, vol, sep) => channels[channel] && applyParams(channels[channel], vol, sep),
      webSfxPlaying: (channel) => !!channels[channel],
      webEvent: onEngineEvent,
    };
    const script = document.createElement('script');
    script.src = 'engine/freedoom.js';
    script.onerror = () => reject(new Error('The game engine did not download.'));
    document.head.append(script);
  });
}

function engineEnded(status, detail) {
  if (!running && status !== -1) return;
  const wasRunning = running;
  running = false;
  document.exitPointerLock?.();
  held.clear();
  syncSaves();
  $('#pad').classList.add('is-hidden');
  $('#topbar').classList.add('is-hidden');
  $('#hint').classList.add('is-hidden');
  $('#screen-over').classList.add('is-hidden');
  const quit = status === 0;
  $('#end-title').textContent = quit ? 'THANKS FOR PLAYING' : 'THE GAME STOPPED';
  $('#end-note').textContent = quit
    ? 'Your saves are kept on this device.'
    : `Something went wrong${wasRunning ? '' : ' while starting'}: ${
        detail || errLines.filter((l) => l.trim()).slice(-1)[0] || 'unknown error'
      }`;
  $('#screen-menu').classList.add('is-hidden');
  $('#screen-end').classList.remove('is-hidden');
}

async function start() {
  const btn = $('#btn-play');
  btn.disabled = true;
  btn.textContent = 'LOADING…';
  $('#menu-message').textContent = '';
  $('#progress').classList.remove('is-hidden');
  unlockAudio();
  try {
    const [wad, mod] = await Promise.all([fetchGameData(), loadEngine()]);
    M = mod;
    setProgress(0.97, 'Starting…');
    M.FS.writeFile('/freedoom2.wad', wad);
    seedConfig(audio ? audio.sampleRate : 44100);

    $('#screen-menu').classList.add('is-hidden');
    $('#topbar').classList.remove('is-hidden');
    running = true;
    showPad();
    const rect = stageEl.getBoundingClientRect();
    M._web_set_page_shape(Math.round(rect.width), Math.round(rect.height));

    const args = ['freedoom', '-iwad', '/freedoom2.wad', '-mb', '48'];
    const argv = M._malloc((args.length + 1) * 4);
    args.forEach((arg, i) => {
      const size = M.lengthBytesUTF8(arg) + 1;
      const p = M._malloc(size);
      M.stringToUTF8(arg, p, size);
      M.HEAP32[(argv >> 2) + i] = p;
    });
    M.HEAP32[(argv >> 2) + args.length] = 0;

    startMusic();
    setInterval(syncSaves, 5000);
    requestAnimationFrame(tick);
    M._web_main(args.length, argv); // returns at the engine's first pause, then carries on by itself
  } catch (err) {
    if (running) return engineEnded(-1, err?.message);
    if (!$('#screen-end').classList.contains('is-hidden')) return;
    btn.disabled = false;
    btn.textContent = '▶ TRY AGAIN';
    $('#progress').classList.add('is-hidden');
    $('#menu-message').textContent = err?.message || 'The game could not be loaded.';
  }
}

/* ---------------------------------------------------------------- buttons -- */

$('#btn-play').addEventListener('click', start);
$('#btn-reload').addEventListener('click', () => location.reload());
$('#btn-menu').addEventListener('click', () => {
  tap(K.ESC);
  $('#btn-menu').blur();
});
[$('#btn-sound'), $('#btn-sound-menu')].forEach((btn) =>
  btn.addEventListener('click', () => {
    unlockAudio();
    setSound(!soundOn);
    btn.blur();
  }),
);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAll();
    syncSaves();
    audio?.suspend?.();
  } else if (audio && running) audio.resume().catch(() => {});
});
window.addEventListener('blur', releaseAll);
window.addEventListener('pagehide', syncSaves);

/* The arcade game page's sound button reaches in here. */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === 'arcade:set-sound') setSound(!!e.data.on);
});

['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => audio && unlockAudio(), { passive: true }),
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

attachArcade(bus, { slug: 'freedoom', title: 'Freedoom', resultSelector: '#screen-over .sheet' });
setSound(soundOn);
layout();

/* A handle for the browser tests; nothing in the game reads it. */
window.__freedoom = {
  get running() {
    return running;
  },
  get run() {
    return run;
  },
  get module() {
    return M;
  },
  key: (down, key) => M._web_key(down, key, 0),
};
