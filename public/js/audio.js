/*
 * All audio is synthesised with the Web Audio API – the game ships with zero
 * media files, which keeps the PWA install tiny and fully offline.
 */

import { settings } from './storage.js';
import { clamp, rand, pick } from './util.js';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuffer = null;
let unlocked = false;

/* ---------------------------------------------------------------- context -- */

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0;
  musicBus.connect(master);

  // Shared white-noise buffer for explosions / thrusters / splats.
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  return ctx;
}

/** Must be called from a user gesture (iOS/Android autoplay policy). */
export function unlock() {
  ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!unlocked) {
    unlocked = true;
    // Silent blip: some browsers only consider the context "started" after a
    // node has actually rendered.
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const o = ctx.createOscillator();
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + 0.02);
  }
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

const now = () => (ctx ? ctx.currentTime : 0);
const sfxOn = () => settings.get('sound') && ctx;

/* ------------------------------------------------------------- primitives -- */

function tone({
  freq = 440,
  freq2 = null,
  type = 'square',
  dur = 0.12,
  vol = 0.3,
  attack = 0.005,
  delay = 0,
  detune = 0,
  dest = null,
}) {
  if (!ctx) return;
  const t = now() + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  if (detune) osc.detune.value = detune;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(dest || sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({
  dur = 0.3,
  vol = 0.4,
  type = 'lowpass',
  freq = 1200,
  freq2 = 120,
  q = 1,
  delay = 0,
  playbackRate = 1,
}) {
  if (!ctx) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.playbackRate.value = playbackRate;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sfxBus);
  src.start(t, rand(0.3));
  src.stop(t + dur + 0.05);
}

/* -------------------------------------------------------------------- sfx -- */

let lastShot = 0;

export const sfx = {
  /** Weapon fire – timbre follows the equipped weapon. */
  shoot(kind = 'ion', level = 0) {
    if (!sfxOn()) return;
    // Rate-limit so continuous-fire weapons don't build a wall of oscillators.
    if (now() - lastShot < 0.035) return;
    lastShot = now();
    const l = clamp(level, 0, 9);
    switch (kind) {
      case 'neutron':
        tone({ freq: 320 + l * 8, freq2: 90, type: 'sawtooth', dur: 0.1, vol: 0.16 });
        break;
      case 'railgun':
        tone({ freq: 1400, freq2: 420, type: 'square', dur: 0.09, vol: 0.12 });
        tone({ freq: 220, freq2: 80, type: 'triangle', dur: 0.14, vol: 0.12 });
        break;
      case 'vulcan':
        tone({ freq: rand(900, 700), freq2: 200, type: 'square', dur: 0.05, vol: 0.09 });
        break;
      case 'positron':
        tone({ freq: 180 + l * 12, type: 'sawtooth', dur: 0.06, vol: 0.07 });
        break;
      case 'poker':
        tone({ freq: 700, freq2: 1500, type: 'triangle', dur: 0.08, vol: 0.12 });
        break;
      case 'lightning':
        noise({ dur: 0.1, vol: 0.14, type: 'highpass', freq: 2600, freq2: 1200 });
        break;
      case 'plasma':
        tone({ freq: 140, freq2: 520, type: 'sine', dur: 0.16, vol: 0.18 });
        break;
      case 'corn':
        noise({ dur: 0.12, vol: 0.16, type: 'bandpass', freq: 1800, freq2: 700, q: 2 });
        break;
      default:
        tone({ freq: 780 + l * 20, freq2: 240, type: 'square', dur: 0.08, vol: 0.13 });
    }
  },

  missile() {
    if (!sfxOn()) return;
    noise({ dur: 0.5, vol: 0.24, type: 'bandpass', freq: 900, freq2: 250, q: 1.2 });
    tone({ freq: 160, freq2: 900, type: 'sawtooth', dur: 0.4, vol: 0.14 });
  },

  hitEnemy() {
    if (!sfxOn()) return;
    tone({ freq: rand(1500, 1100), freq2: 500, type: 'square', dur: 0.04, vol: 0.07 });
  },

  /** Chicken death – a squawk plus a feather puff. */
  cluck(pitch = 1) {
    if (!sfxOn()) return;
    const f = 520 * pitch;
    tone({ freq: f, freq2: f * 2.1, type: 'sawtooth', dur: 0.07, vol: 0.16 });
    tone({ freq: f * 1.6, freq2: f * 0.7, type: 'square', dur: 0.11, vol: 0.12, delay: 0.06 });
    noise({ dur: 0.16, vol: 0.12, type: 'bandpass', freq: 1500, freq2: 400, q: 1.5, delay: 0.02 });
  },

  explosion(size = 1) {
    if (!sfxOn()) return;
    noise({
      dur: 0.35 * size,
      vol: clamp(0.28 * size, 0.1, 0.5),
      freq: 900 * size,
      freq2: 60,
      playbackRate: 1 / clamp(size, 0.6, 2),
    });
    tone({ freq: 120 * size, freq2: 30, type: 'triangle', dur: 0.4 * size, vol: 0.18 });
  },

  bigExplosion() {
    if (!sfxOn()) return;
    for (let i = 0; i < 4; i++) {
      noise({ dur: 0.9, vol: 0.3, freq: 1400, freq2: 40, delay: i * 0.09, playbackRate: rand(1.1, 0.6) });
    }
    tone({ freq: 90, freq2: 22, type: 'triangle', dur: 1.2, vol: 0.28 });
  },

  eggCrack() {
    if (!sfxOn()) return;
    noise({ dur: 0.14, vol: 0.16, type: 'bandpass', freq: 2200, freq2: 600, q: 1.4 });
  },

  eggDrop() {
    if (!sfxOn()) return;
    tone({ freq: 900, freq2: 400, type: 'triangle', dur: 0.06, vol: 0.05 });
  },

  playerHit() {
    if (!sfxOn()) return;
    noise({ dur: 0.7, vol: 0.4, freq: 1600, freq2: 40 });
    tone({ freq: 300, freq2: 40, type: 'sawtooth', dur: 0.8, vol: 0.25 });
  },

  pickup() {
    if (!sfxOn()) return;
    tone({ freq: 880, type: 'triangle', dur: 0.07, vol: 0.14 });
    tone({ freq: 1320, type: 'triangle', dur: 0.09, vol: 0.12, delay: 0.06 });
  },

  food() {
    if (!sfxOn()) return;
    tone({ freq: pick([740, 880, 990]), type: 'sine', dur: 0.07, vol: 0.1 });
  },

  powerup() {
    if (!sfxOn()) return;
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'square', dur: 0.12, vol: 0.13, delay: i * 0.055 })
    );
  },

  weaponSwap() {
    if (!sfxOn()) return;
    [392, 523, 659, 880, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.14, delay: i * 0.05 })
    );
  },

  extraLife() {
    if (!sfxOn()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, type: 'square', dur: 0.2, vol: 0.14, delay: i * 0.09 })
    );
  },

  shield() {
    if (!sfxOn()) return;
    tone({ freq: 200, freq2: 1200, type: 'sine', dur: 0.4, vol: 0.16 });
  },

  bossWarn() {
    if (!sfxOn()) return;
    for (let i = 0; i < 3; i++) {
      tone({ freq: 180, freq2: 260, type: 'sawtooth', dur: 0.35, vol: 0.2, delay: i * 0.45 });
    }
  },

  /** Mothership klaxon. */
  siren() {
    if (!sfxOn()) return;
    for (let i = 0; i < 2; i++) {
      tone({ freq: 420, freq2: 700, type: 'sawtooth', dur: 0.32, vol: 0.16, delay: i * 0.34 });
      tone({ freq: 210, freq2: 350, type: 'square', dur: 0.32, vol: 0.12, delay: i * 0.34 });
    }
  },

  /** Rising whine as the cutting beam charges. */
  beamCharge() {
    if (!sfxOn()) return;
    tone({ freq: 180, freq2: 1400, type: 'sawtooth', dur: 0.85, vol: 0.14 });
    noise({ dur: 0.85, vol: 0.1, type: 'highpass', freq: 600, freq2: 4000 });
  },

  beamFire() {
    if (!sfxOn()) return;
    noise({ dur: 1.4, vol: 0.2, type: 'bandpass', freq: 2400, freq2: 900, q: 0.8 });
    tone({ freq: 900, freq2: 300, type: 'sawtooth', dur: 1.2, vol: 0.12 });
  },

  bayOpen() {
    if (!sfxOn()) return;
    noise({ dur: 0.4, vol: 0.16, type: 'lowpass', freq: 900, freq2: 200 });
    tone({ freq: 120, freq2: 260, type: 'square', dur: 0.3, vol: 0.12 });
  },

  bossRoar() {
    if (!sfxOn()) return;
    tone({ freq: 240, freq2: 70, type: 'sawtooth', dur: 1.1, vol: 0.26 });
    tone({ freq: 121, freq2: 40, type: 'square', dur: 1.3, vol: 0.2 });
    noise({ dur: 1.0, vol: 0.16, type: 'bandpass', freq: 700, freq2: 180, q: 0.8 });
  },

  waveClear() {
    if (!sfxOn()) return;
    [659, 784, 988, 1319].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.15, delay: i * 0.11 })
    );
  },

  gameOver() {
    if (!sfxOn()) return;
    [523, 466, 392, 311, 262].forEach((f, i) =>
      tone({ freq: f, type: 'sawtooth', dur: 0.45, vol: 0.18, delay: i * 0.22 })
    );
  },

  ui() {
    if (!sfxOn()) return;
    tone({ freq: 660, freq2: 990, type: 'square', dur: 0.05, vol: 0.1 });
  },

  uiBack() {
    if (!sfxOn()) return;
    tone({ freq: 500, freq2: 300, type: 'square', dur: 0.06, vol: 0.09 });
  },

  /** Resume countdown: pitch rises as it reaches zero. */
  countdown(n) {
    if (!sfxOn()) return;
    const freq = n <= 1 ? 1046 : 523 + (3 - n) * 70;
    tone({ freq, type: 'square', dur: n <= 1 ? 0.26 : 0.16, vol: 0.16 });
  },
};

/* ------------------------------------------------------------------ music -- */

/*
 * A tiny step sequencer: driving bass, off-beat arpeggio and a hat. Two
 * variations – "space" for normal waves and "boss" (faster, minor) for fights.
 */

const SCALES = {
  space: [0, 3, 7, 10, 12, 15],
  boss: [0, 1, 5, 8, 12, 13],
};

const musicState = {
  playing: false,
  mode: 'space',
  step: 0,
  nextTime: 0,
  timer: 0,
  bpm: 104,
  root: 55, // A1
};

function scheduleStep(time) {
  const { mode, step } = musicState;
  const scale = SCALES[mode];
  const root = musicState.root * (mode === 'boss' ? 1.06 : 1);
  const beat = step % 16;

  // Bass on the pulse.
  if (beat % 4 === 0 || beat === 7 || beat === 14) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = root * (beat === 14 ? 1.5 : 1);
    o.frequency.setValueAtTime(f, time);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(mode === 'boss' ? 900 : 600, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.16, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    o.connect(lp);
    lp.connect(g);
    g.connect(musicBus);
    o.start(time);
    o.stop(time + 0.3);
  }

  // Arpeggio.
  if (beat % 2 === 1 || mode === 'boss') {
    const note = scale[(step * 3 + (beat >> 2)) % scale.length];
    const f = root * 4 * Math.pow(2, note / 12);
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = mode === 'boss' ? 'square' : 'triangle';
    o.frequency.setValueAtTime(f, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.055, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    o.connect(g);
    g.connect(musicBus);
    o.start(time);
    o.stop(time + 0.22);
  }

  // Hat.
  if (beat % 2 === 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 1.8;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(musicBus);
    src.start(time, rand(0.5));
    src.stop(time + 0.07);
  }
}

function pump() {
  if (!musicState.playing || !ctx) return;
  const spb = 60 / musicState.bpm / 4; // 16th notes
  const horizon = ctx.currentTime + 0.25;
  while (musicState.nextTime < horizon) {
    if (musicState.nextTime < ctx.currentTime) musicState.nextTime = ctx.currentTime + 0.02;
    scheduleStep(musicState.nextTime);
    musicState.nextTime += spb;
    musicState.step = (musicState.step + 1) % 64;
  }
}

export const music = {
  start(mode = 'space') {
    ensureContext();
    if (!ctx || !settings.get('music')) return;
    musicState.mode = mode;
    musicState.bpm = mode === 'boss' ? 132 : 104;
    if (musicState.playing) return;
    musicState.playing = true;
    musicState.nextTime = ctx.currentTime + 0.05;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);
    musicState.timer = setInterval(pump, 60);
    pump();
  },

  setMode(mode) {
    if (musicState.mode === mode) return;
    musicState.mode = mode;
    musicState.bpm = mode === 'boss' ? 132 : 104;
  },

  stop(fade = 0.5) {
    if (!ctx || !musicState.playing) return;
    musicState.playing = false;
    clearInterval(musicState.timer);
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
  },

  duck(on) {
    if (!ctx || !musicState.playing) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(on ? 0.12 : 0.5, ctx.currentTime + 0.2);
  },

  get playing() {
    return musicState.playing;
  },
};

/** Fired when the music setting is switched off mid-game. */
export function syncMusicSetting(playing) {
  if (!settings.get('music')) music.stop(0.3);
  else if (playing) music.start(musicState.mode);
}

export function vibrate(pattern) {
  if (!settings.get('haptics')) return;
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (err) {
      /* ignore */
    }
  }
}
