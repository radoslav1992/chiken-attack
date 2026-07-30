/*
 * Orbit Cadet audio — synthesised, no media files.
 *
 * Pinball is chimes, bells and solenoid thuds, which is exactly what simple
 * oscillators and filtered noise are good at. Velocity is passed in where it
 * matters so a hard hit sounds harder rather than merely more frequent.
 */

const store = {
  get on() {
    try {
      return localStorage.getItem('orbit-cadet.sound') !== 'off';
    } catch {
      return true;
    }
  },
  set on(v) {
    try {
      localStorage.setItem('orbit-cadet.sound', v ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  },
};

let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.7);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export function setSound(on) {
  store.on = on;
}
export function soundOn() {
  return store.on;
}

const ok = () => store.on && ctx;
const now = () => (ctx ? ctx.currentTime : 0);

function tone({ freq = 440, freq2 = null, type = 'sine', dur = 0.12, vol = 0.2, delay = 0 }) {
  if (!ctx) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.2, freq = 1200, freq2 = 200, type = 'lowpass', q = 0, delay = 0 }) {
  if (!ctx) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  if (q) f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.04);
}

/** A struck metal chime: a couple of inharmonic partials, short decay. */
function chime(freq, vol = 0.16, dur = 0.26) {
  tone({ freq, type: 'sine', dur, vol });
  tone({ freq: freq * 2.76, type: 'sine', dur: dur * 0.6, vol: vol * 0.4 });
  tone({ freq: freq * 5.4, type: 'sine', dur: dur * 0.3, vol: vol * 0.15 });
}

export const sfx = {
  /** Ball on a wall or guide — quiet, and scaled by impact so it stays subtle. */
  clack(v = 1) {
    if (!ok()) return;
    const s = Math.min(1, v / 900);
    if (s < 0.06) return;
    noise({ dur: 0.04 + s * 0.03, vol: 0.03 + s * 0.1, freq: 2600, freq2: 500, type: 'bandpass', q: 1.5 });
  },
  bumper(v = 1) {
    if (!ok()) return;
    chime(660 + Math.random() * 120, 0.13, 0.2);
    noise({ dur: 0.06, vol: 0.09, freq: 1800, freq2: 300 });
  },
  sling() {
    if (!ok()) return;
    noise({ dur: 0.08, vol: 0.16, freq: 3000, freq2: 400, type: 'bandpass', q: 1 });
    tone({ freq: 220, freq2: 90, type: 'triangle', dur: 0.09, vol: 0.14 });
  },
  target(i = 0) {
    if (!ok()) return;
    chime([784, 988, 1175][i % 3], 0.16, 0.3);
  },
  bankClear() {
    if (!ok()) return;
    [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.13, delay: i * 0.07 }));
  },
  spinner(n = 0) {
    if (!ok()) return;
    tone({ freq: 900 + (n % 12) * 60, type: 'square', dur: 0.04, vol: 0.06 });
  },
  orbit() {
    if (!ok()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.12, delay: i * 0.05 }));
  },
  flip() {
    if (!ok()) return;
    noise({ dur: 0.05, vol: 0.1, freq: 700, freq2: 160 });
    tone({ freq: 130, freq2: 70, type: 'square', dur: 0.05, vol: 0.09 });
  },
  plunge(power = 1) {
    if (!ok()) return;
    noise({ dur: 0.16, vol: 0.12 + power * 0.1, freq: 500, freq2: 2200, type: 'bandpass', q: 1.2 });
    tone({ freq: 160 + power * 120, freq2: 90, type: 'sawtooth', dur: 0.18, vol: 0.12 });
  },
  select() {
    if (!ok()) return;
    tone({ freq: 520, freq2: 880, type: 'square', dur: 0.1, vol: 0.12 });
  },
  missionStart() {
    if (!ok()) return;
    [392, 523, 659].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.2, vol: 0.12, delay: i * 0.1 }));
  },
  missionDone() {
    if (!ok()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => chime(f, 0.17, 0.4), i * 90));
  },
  rankUp() {
    if (!ok()) return;
    [440, 554, 659, 880].forEach((f, i) => tone({ freq: f, freq2: f * 1.5, type: 'triangle', dur: 0.3, vol: 0.14, delay: i * 0.12 }));
  },
  multiball() {
    if (!ok()) return;
    for (let i = 0; i < 8; i++) tone({ freq: 300 + i * 140, type: 'square', dur: 0.1, vol: 0.1, delay: i * 0.06 });
  },
  nudge() {
    if (!ok()) return;
    noise({ dur: 0.1, vol: 0.14, freq: 260, freq2: 70 });
  },
  tilt() {
    if (!ok()) return;
    noise({ dur: 0.7, vol: 0.24, freq: 900, freq2: 60 });
    tone({ freq: 180, freq2: 50, type: 'sawtooth', dur: 0.6, vol: 0.16 });
  },
  drain() {
    if (!ok()) return;
    tone({ freq: 300, freq2: 70, type: 'triangle', dur: 0.5, vol: 0.14 });
    noise({ dur: 0.4, vol: 0.1, freq: 700, freq2: 90 });
  },
  gameover() {
    if (!ok()) return;
    [523, 440, 349, 262].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.28, vol: 0.13, delay: i * 0.17 }));
  },
  ui() {
    if (!ok()) return;
    tone({ freq: 660, freq2: 880, type: 'square', dur: 0.05, vol: 0.1 });
  },
};
