/*
 * Beaver Dash audio — synthesised with the Web Audio API, no media files.
 * Mirrors the approach used by Chicken Attack but much smaller.
 */

const store = {
  get on() {
    try {
      return localStorage.getItem('beaver-dash.sound') !== 'off';
    } catch {
      return true;
    }
  },
  set on(v) {
    try {
      localStorage.setItem('beaver-dash.sound', v ? 'on' : 'off');
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
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.8);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
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

const now = () => (ctx ? ctx.currentTime : 0);
const ok = () => store.on && ctx;

function tone({ freq = 440, freq2 = null, type = 'square', dur = 0.1, vol = 0.2, delay = 0 }) {
  if (!ctx) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.25, vol = 0.25, freq = 1200, freq2 = 100, type = 'lowpass', delay = 0 }) {
  if (!ctx) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  jump(second = false) {
    if (!ok()) return;
    tone({ freq: second ? 330 : 260, freq2: second ? 660 : 520, type: 'square', dur: 0.14, vol: 0.16 });
  },
  land() {
    if (!ok()) return;
    noise({ dur: 0.08, vol: 0.1, freq: 500, freq2: 120 });
  },
  step() {
    if (!ok()) return;
    noise({ dur: 0.04, vol: 0.03, freq: 700, freq2: 200 });
  },
  acorn() {
    if (!ok()) return;
    tone({ freq: 880, type: 'triangle', dur: 0.06, vol: 0.13 });
    tone({ freq: 1320, type: 'triangle', dur: 0.08, vol: 0.11, delay: 0.05 });
  },
  golden() {
    if (!ok()) return;
    [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.1, vol: 0.12, delay: i * 0.05 }));
  },
  milestone() {
    if (!ok()) return;
    [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.13, delay: i * 0.07 }));
  },
  heron() {
    if (!ok()) return;
    tone({ freq: 1200, freq2: 700, type: 'sawtooth', dur: 0.18, vol: 0.06 });
  },
  crash() {
    if (!ok()) return;
    noise({ dur: 0.5, vol: 0.35, freq: 1500, freq2: 60 });
    tone({ freq: 220, freq2: 45, type: 'sawtooth', dur: 0.5, vol: 0.2 });
  },
  gameover() {
    if (!ok()) return;
    [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.22, vol: 0.13, delay: i * 0.14 }));
  },
  ui() {
    if (!ok()) return;
    tone({ freq: 660, freq2: 880, type: 'square', dur: 0.05, vol: 0.1 });
  },
};
