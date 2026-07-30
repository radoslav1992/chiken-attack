/*
 * Whittle & Wares — sound, synthesised.
 *
 * No audio files: every sound is a few oscillators and an envelope. A shop game
 * makes a lot of small confirmations — a coin, a gather, a page turn — and those
 * want to be short, quiet and different enough from each other to be told apart
 * without looking.
 */

let ctx = null;
let master = null;
let on = true;

const KEY = 'whittle-wares.sound';

try {
  on = localStorage.getItem(KEY) !== 'off';
} catch {
  /* private mode: default to on */
}

export function soundOn() {
  return on;
}

export function setSound(v) {
  on = !!v;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {}
  if (master) master.gain.value = on ? 0.5 : 0;
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = on ? 0.5 : 0;
  master.connect(ctx.destination);
}

function tone({ type = 'sine', from, to, dur = 0.12, gain = 0.2, delay = 0 }) {
  if (!ctx || !on) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.14, delay = 0, hp = 400 }) {
  if (!ctx || !on) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  step() {
    noise({ dur: 0.05, gain: 0.05, hp: 900 });
  },
  gather() {
    tone({ type: 'triangle', from: 520, to: 780, dur: 0.1, gain: 0.16 });
    noise({ dur: 0.09, gain: 0.07, hp: 1200 });
  },
  /** Rising pips as the satchel fills — the deeper the band, the higher. */
  found(band) {
    tone({ type: 'square', from: 420 + band * 90, to: 700 + band * 120, dur: 0.13, gain: 0.12 });
  },
  sting() {
    tone({ type: 'sawtooth', from: 300, to: 90, dur: 0.22, gain: 0.16 });
    noise({ dur: 0.16, gain: 0.1, hp: 300 });
  },
  gate() {
    noise({ dur: 0.3, gain: 0.12, hp: 200 });
    tone({ type: 'triangle', from: 180, to: 300, dur: 0.3, gain: 0.1 });
  },
  coin() {
    tone({ type: 'square', from: 880, dur: 0.06, gain: 0.13 });
    tone({ type: 'square', from: 1320, dur: 0.1, gain: 0.11, delay: 0.05 });
  },
  sale(n = 1) {
    for (let i = 0; i < Math.min(3, n); i++) {
      tone({ type: 'square', from: 660 + i * 220, dur: 0.08, gain: 0.11, delay: i * 0.06 });
    }
  },
  refuse() {
    tone({ type: 'sawtooth', from: 220, to: 150, dur: 0.16, gain: 0.12 });
  },
  walkout() {
    tone({ type: 'triangle', from: 300, to: 160, dur: 0.24, gain: 0.1 });
  },
  craft() {
    noise({ dur: 0.1, gain: 0.12, hp: 700 });
    tone({ type: 'triangle', from: 300, to: 560, dur: 0.18, gain: 0.14, delay: 0.05 });
  },
  buy() {
    tone({ type: 'triangle', from: 440, dur: 0.1, gain: 0.15 });
    tone({ type: 'triangle', from: 660, dur: 0.14, gain: 0.13, delay: 0.09 });
    tone({ type: 'triangle', from: 880, dur: 0.2, gain: 0.12, delay: 0.18 });
  },
  ui() {
    tone({ type: 'square', from: 520, dur: 0.05, gain: 0.08 });
  },
  day() {
    [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.3, gain: 0.11, delay: i * 0.12 }));
  },
  rent() {
    tone({ type: 'sawtooth', from: 160, to: 110, dur: 0.5, gain: 0.14 });
  },
  ruin() {
    [330, 262, 196, 147].forEach((f, i) =>
      tone({ type: 'sawtooth', from: f, to: f * 0.6, dur: 0.45, gain: 0.13, delay: i * 0.2 })
    );
  },
  spoil() {
    tone({ type: 'sine', from: 260, to: 120, dur: 0.3, gain: 0.1 });
  },
};
