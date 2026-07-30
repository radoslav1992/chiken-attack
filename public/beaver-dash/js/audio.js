/*
 * Beaver Dash audio — synthesised with the Web Audio API, no media files.
 *
 * Two halves: one-shot `sfx` for events, and a `music` bed that runs a short
 * looping bassline scheduled a beat ahead of the clock. The bed tightens as
 * the run's difficulty tier rises, which is the cheapest way to make the pace
 * audible before it is visible.
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
let musicGain = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.34; // sits well under the effects
  musicGain.connect(master);
  const len = Math.floor(ctx.sampleRate * 0.8);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (music.wanted) music.start();
}

export function setSound(on) {
  store.on = on;
  if (!on) music.stop();
  else if (music.wanted) music.start();
}

export function soundOn() {
  return store.on;
}

const now = () => (ctx ? ctx.currentTime : 0);
const ok = () => store.on && ctx;

function tone({ freq = 440, freq2 = null, type = 'square', dur = 0.1, vol = 0.2, delay = 0, dest = null }) {
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
  g.connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.25, vol = 0.25, freq = 1200, freq2 = 100, type = 'lowpass', q = 0, delay = 0 }) {
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
  src.stop(t + dur + 0.05);
}

export const sfx = {
  jump(second = false) {
    if (!ok()) return;
    tone({ freq: second ? 340 : 250, freq2: second ? 700 : 540, type: 'square', dur: 0.13, vol: 0.15 });
    if (second) tone({ freq: 900, freq2: 1500, type: 'triangle', dur: 0.1, vol: 0.07 });
  },
  land(hard = false) {
    if (!ok()) return;
    noise({ dur: hard ? 0.16 : 0.08, vol: hard ? 0.2 : 0.09, freq: hard ? 700 : 500, freq2: 90 });
    if (hard) tone({ freq: 140, freq2: 60, type: 'sine', dur: 0.16, vol: 0.16 });
  },
  step() {
    if (!ok()) return;
    noise({ dur: 0.035, vol: 0.028, freq: 800, freq2: 240 });
  },
  dive() {
    if (!ok()) return;
    tone({ freq: 700, freq2: 130, type: 'sawtooth', dur: 0.22, vol: 0.12 });
    noise({ dur: 0.24, vol: 0.1, freq: 300, freq2: 2400, type: 'bandpass', q: 2 });
  },
  smash() {
    if (!ok()) return;
    noise({ dur: 0.3, vol: 0.28, freq: 1800, freq2: 120 });
    tone({ freq: 180, freq2: 70, type: 'square', dur: 0.2, vol: 0.16 });
    tone({ freq: 620, freq2: 980, type: 'triangle', dur: 0.14, vol: 0.1, delay: 0.05 });
  },
  acorn(chain = 1) {
    if (!ok()) return;
    // Pitch climbs with the chain, so a long run of acorns sounds like one.
    const base = 820 * Math.pow(1.03, Math.min(chain, 18));
    tone({ freq: base, type: 'triangle', dur: 0.06, vol: 0.12 });
    tone({ freq: base * 1.5, type: 'triangle', dur: 0.07, vol: 0.09, delay: 0.045 });
  },
  combo(mult) {
    if (!ok()) return;
    [0, 4, 7].forEach((semi, i) =>
      tone({ freq: 520 * Math.pow(2, (semi + mult * 2) / 12), type: 'square', dur: 0.11, vol: 0.1, delay: i * 0.045 })
    );
  },
  golden() {
    if (!ok()) return;
    [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.1, vol: 0.11, delay: i * 0.05 }));
  },
  shieldUp() {
    if (!ok()) return;
    tone({ freq: 300, freq2: 900, type: 'triangle', dur: 0.3, vol: 0.13 });
    tone({ freq: 600, freq2: 1400, type: 'sine', dur: 0.34, vol: 0.08, delay: 0.04 });
  },
  shieldBreak() {
    if (!ok()) return;
    noise({ dur: 0.3, vol: 0.22, freq: 2600, freq2: 300, type: 'bandpass', q: 1.5 });
    tone({ freq: 880, freq2: 240, type: 'triangle', dur: 0.26, vol: 0.12 });
  },
  whoosh() {
    if (!ok()) return;
    noise({ dur: 0.16, vol: 0.11, freq: 500, freq2: 3000, type: 'bandpass', q: 1.2 });
  },
  milestone() {
    if (!ok()) return;
    [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.12, delay: i * 0.07 }));
  },
  thunder() {
    if (!ok()) return;
    noise({ dur: 1.5, vol: 0.16, freq: 260, freq2: 40, delay: 0.12 });
    tone({ freq: 60, freq2: 32, type: 'sine', dur: 1.3, vol: 0.1, delay: 0.14 });
  },
  splash() {
    if (!ok()) return;
    noise({ dur: 0.5, vol: 0.3, freq: 3000, freq2: 260, type: 'bandpass', q: 0.8 });
    tone({ freq: 400, freq2: 90, type: 'sine', dur: 0.4, vol: 0.14 });
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

/* --- music ----------------------------------------------------------------
 * A four-bar loop in A minor, scheduled one beat ahead on a timer rather than
 * from the render loop: rAF stops in a background tab, which would leave the
 * bed hanging on whatever note was last queued.
 */

const ROOTS = [110, 110, 146.83, 130.81]; // A2 A2 D3 C3
const ARP = [0, 7, 12, 7, 3, 10, 12, 15];
const TEMPI = [104, 116, 128, 140]; // bpm per difficulty tier

const music = {
  wanted: false,
  timer: null,
  beat: 0,
  next: 0,
  bpm: TEMPI[0],

  start() {
    this.wanted = true;
    if (!store.on) return;
    ensure();
    if (!ctx || this.timer) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.next = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.pump(), 60);
  },

  stop() {
    this.wanted = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  tier(n) {
    this.bpm = TEMPI[Math.max(0, Math.min(TEMPI.length - 1, n))];
  },

  pump() {
    if (!ctx || !store.on) return;
    const spb = 60 / this.bpm / 2; // eighth notes
    // Schedule everything falling inside the next 0.25 s and no more, so a
    // tempo change lands within a beat.
    while (this.next < ctx.currentTime + 0.25) {
      this.emit(this.next, this.beat);
      this.next += spb;
      this.beat = (this.beat + 1) % 32;
    }
  },

  emit(t, beat) {
    const bar = (beat >> 3) & 3;
    const root = ROOTS[bar];
    const eighth = beat & 7;

    // Bass on the downbeats.
    if (eighth % 4 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(root / 2, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g);
      g.connect(musicGain);
      o.start(t);
      o.stop(t + 0.3);
    }

    // Arpeggio, quieter and detuned a hair for width.
    const semi = ARP[eighth];
    const f = root * Math.pow(2, semi / 12);
    for (const d of [1, 1.004]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f * 2 * d, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g);
      g.connect(musicGain);
      o.start(t);
      o.stop(t + 0.17);
    }

    // Off-beat tick for the pulse.
    if (eighth % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(hp);
      hp.connect(g);
      g.connect(musicGain);
      src.start(t, Math.random() * 0.4);
      src.stop(t + 0.06);
    }
  },
};

export { music };
