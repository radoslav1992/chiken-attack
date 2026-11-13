/*
 * Timber Tails — sound. Everything is synthesised: square and triangle waves
 * for the tunes, a little noise for thumps. No audio files ship.
 */

let ctx = null;
let master = null;
let enabled = true;
try {
  enabled = localStorage.getItem('timber-tails.sound') !== 'off';
} catch {}

export const soundOn = () => enabled;

export function setSound(on) {
  enabled = !!on;
  try {
    localStorage.setItem('timber-tails.sound', enabled ? 'on' : 'off');
  } catch {}
  if (master) master.gain.value = enabled ? 1 : 0;
}

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function tone(freq, dur, type = 'square', vol = 0.06, slide = 0, at = 0) {
  if (!ctx || !enabled) return;
  const t0 = Math.max(ctx.currentTime, at || ctx.currentTime);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, vol = 0.06, at = 0) {
  if (!ctx || !enabled) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = Math.max(ctx.currentTime, at || ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

const seq = (notes, step, type = 'square', vol = 0.06) => {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  notes.forEach((f, i) => f && tone(f, step * 1.4, type, vol, 0, t0 + i * step));
};

export const sfx = {
  jump: () => tone(260, 0.14, 'square', 0.045, 560),
  land: () => noise(0.04, 0.025),
  dive: () => tone(520, 0.16, 'sawtooth', 0.04, 140),
  slam: () => {
    noise(0.18, 0.11);
    tone(110, 0.2, 'triangle', 0.14, 45);
  },
  acorn: () => {
    tone(1175, 0.05, 'square', 0.04);
    tone(1568, 0.12, 'square', 0.04, 0, ctx ? ctx.currentTime + 0.05 : 0);
  },
  bump: () => tone(190, 0.08, 'triangle', 0.1, 90),
  break: () => {
    noise(0.12, 0.09);
    tone(160, 0.1, 'sawtooth', 0.04, 60);
  },
  sprout: () => seq([392, 494, 587, 740, 880], 0.045, 'square', 0.04),
  stomp: () => {
    tone(480, 0.09, 'square', 0.06, 180);
    noise(0.04, 0.04);
  },
  defeat: () => tone(300, 0.12, 'triangle', 0.07, 90),
  berry: () => seq([659, 784, 988], 0.06, 'triangle', 0.08),
  power: () => seq([440, 554, 659, 880, 1109], 0.06, 'square', 0.05),
  gold: () => seq([523, 659, 784, 1047, 1319, 1568], 0.05, 'square', 0.05),
  life: () => seq([784, 988, 1175, 1568, 1976], 0.08, 'square', 0.055),
  log: () => seq([988, 1319, 1568, 1976], 0.07, 'triangle', 0.09),
  hurt: () => seq([440, 311, 220], 0.07, 'sawtooth', 0.06),
  die: () => seq([523, 494, 440, 392, 330, 262, 196], 0.09, 'square', 0.06),
  splash: () => {
    noise(0.3, 0.09);
    tone(300, 0.3, 'sine', 0.08, 70);
  },
  check: () => seq([523, 659, 784], 0.07, 'triangle', 0.09),
  boing: () => tone(160, 0.22, 'sine', 0.13, 640),
  throw: () => tone(700, 0.07, 'triangle', 0.06, 300),
  puff: () => noise(0.05, 0.04),
  crumble: () => noise(0.16, 0.06),
  shatter: () => {
    noise(0.08, 0.06);
    tone(1800, 0.08, 'square', 0.03, 900);
  },
  whoosh: () => noise(0.4, 0.035),
  clang: () => tone(900, 0.1, 'square', 0.05, 700),
  crash: () => {
    noise(0.25, 0.12);
    tone(70, 0.3, 'triangle', 0.15, 40);
  },
  snort: () => tone(120, 0.18, 'sawtooth', 0.06, 80),
  leap: () => tone(140, 0.3, 'sawtooth', 0.05, 420),
  bosshit: () => seq([196, 262, 196, 147], 0.06, 'sawtooth', 0.08),
  bossdown: () => seq([262, 330, 392, 523, 659, 784, 1047], 0.09, 'square', 0.06),
  clear: () => seq([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.1, 'square', 0.06),
  ui: () => tone(660, 0.05, 'square', 0.035),
  tick: () => tone(1400, 0.02, 'square', 0.02),
  over: () => seq([392, 370, 349, 330, 262, 196], 0.16, 'triangle', 0.09),
};

/* ---------------------------------------------------------------- music -- */

const NOTE = {};
{
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  for (let o = 1; o <= 6; o++)
    names.forEach((n, i) => {
      NOTE[n + o] = 440 * Math.pow(2, (i - 9 + (o - 4) * 12) / 12);
    });
}
const line = (s) => s.split(/\s+/).filter(Boolean).map((n) => (n === '.' ? 0 : NOTE[n]));

/* Five short loops, written for this game. `step` is seconds per slot. */
const TUNES = {
  day: {
    step: 0.2,
    lead: line(`G4 . C5 . E5 D5 C5 . A4 . C5 . D5 . . .
                G4 . C5 . E5 G5 E5 . D5 C5 A4 . C5 . . .
                E5 . G5 . A5 G5 E5 . D5 . E5 . C5 . . .
                A4 . C5 . D5 E5 D5 . C5 A4 G4 . C5 . . .`),
    bass: line(`C3 . G3 . C3 . G3 . F3 . C3 . F3 . G3 .
                C3 . G3 . E3 . G3 . F3 . G3 . C3 . . .
                A2 . E3 . A2 . E3 . G2 . D3 . C3 . G3 .
                F2 . C3 . G2 . D3 . F2 . G2 . C3 . . .`),
  },
  deep: {
    step: 0.24,
    lead: line(`A4 . . E4 . . A4 B4 C5 . . B4 . A4 . .
                F4 . . C4 . . F4 G4 E4 . . . . . . .
                A4 . . E4 . . A4 B4 C5 . . D5 . E5 . .
                D5 . C5 . B4 . Ab4 . A4 . . . . . . .`),
    bass: line(`A2 . E3 . A2 . E3 . A2 . E3 . A2 . E3 .
                F2 . C3 . F2 . C3 . E2 . B2 . E2 . B2 .
                A2 . E3 . A2 . E3 . A2 . E3 . C3 . E3 .
                D3 . A2 . E3 . E2 . A2 . E3 . A2 . . .`),
  },
  water: {
    step: 0.22,
    lead: line(`F4 . A4 C5 . A4 G4 . B4 D5 . B4
                A4 . C5 E5 . C5 G4 . . E4 . .
                F4 . A4 C5 . F5 E5 . D5 B4 . G4
                A4 . C5 B4 . G4 C5 . . . . .`),
    bass: line(`F2 . . C3 . . G2 . . D3 . .
                A2 . . E3 . . C3 . . G2 . .
                F2 . . C3 . . G2 . . D3 . .
                A2 . . G2 . . C3 . . G2 . .`),
  },
  storm: {
    step: 0.17,
    lead: line(`D5 . D5 F5 . E5 D5 . C5 . A4 . C5 . D5 .
                D5 . D5 F5 . G5 A5 . G5 F5 E5 . D5 . . .
                Bb4 . Bb4 D5 . C5 Bb4 . A4 . F4 . A4 . C5 .
                D5 . F5 . E5 . Db5 . D5 . . . . . . .`),
    bass: line(`D3 D3 . D3 A2 . D3 . C3 C3 . C3 G2 . C3 .
                Bb2 Bb2 . Bb2 F2 . Bb2 . A2 A2 . A2 E2 . A2 .
                Bb2 Bb2 . Bb2 F2 . Bb2 . F2 F2 . F2 C3 . F2 .
                G2 G2 . G2 A2 . A2 . D3 . A2 . D3 . . .`),
  },
  boss: {
    step: 0.13,
    lead: line(`E4 F4 E4 . B4 . A4 G4 F4 . E4 . F4 G4 . .
                E4 F4 E4 . B4 . C5 B4 A4 G4 F4 . E4 . . .
                E5 . D5 E5 . B4 . D5 C5 . B4 . A4 B4 . .
                G4 A4 B4 . C5 B4 A4 G4 F4 . Gb4 . E4 . . .`),
    bass: line(`E2 E2 E3 E2 E2 E3 E2 E2 F2 F2 F3 F2 F2 F3 F2 F2
                E2 E2 E3 E2 E2 E3 E2 E2 F2 F2 F3 F2 E2 . E2 .
                A2 A2 A3 A2 A2 A3 A2 A2 G2 G2 G3 G2 G2 G3 G2 G2
                C3 C3 C3 . B2 B2 B2 . F2 F2 Gb2 Gb2 E2 . E2 .`),
  },
};

let playing = null;
let timer = null;
let stepAt = 0;
let stepNo = 0;
let hurry = 1;

function schedule() {
  if (!ctx || !playing) return;
  const tune = TUNES[playing];
  const dur = tune.step / hurry;
  if (stepAt < ctx.currentTime - 0.3) stepAt = ctx.currentTime + 0.05;
  while (stepAt < ctx.currentTime + 0.12) {
    if (enabled && ctx.state === 'running') {
      const lead = tune.lead[stepNo % tune.lead.length];
      const bass = tune.bass[stepNo % tune.bass.length];
      if (lead) tone(lead, dur * 1.6, 'square', 0.022, 0, stepAt);
      if (bass) tone(bass, dur * 1.8, 'triangle', 0.05, 0, stepAt);
      if (playing === 'boss' || playing === 'storm') {
        if (stepNo % 4 === 2) noise(0.03, 0.018, stepAt);
      }
    }
    stepAt += dur;
    stepNo++;
  }
}

export const music = {
  play(name) {
    if (playing === name) return;
    playing = name;
    stepNo = 0;
    stepAt = 0;
    hurry = 1;
    if (!timer) timer = setInterval(schedule, 30);
  },
  stop() {
    playing = null;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  hurry(on) {
    hurry = on ? 1.35 : 1;
  },
  get current() {
    return playing;
  },
};
