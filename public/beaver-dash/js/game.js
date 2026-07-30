/*
 * Beaver Dash — an endless runner. The beaver runs on its own; the player owns
 * one button, and each obstacle asks a different question of it:
 *
 *   stump  → a tap hop is enough
 *   logs   → wide: needs a full held jump, a hop lands on it
 *   gap    → needs distance, not height
 *   dam    → taller than one jump: needs the double jump
 *   heron  → flies at hop height, so the answer is to press nothing
 *
 * A third press in the air is a tail-slam dive, which smashes stumps and rocks
 * for points. It costs you the rest of your descent, so diving early leaves you
 * on the ground with nothing left for whatever is next.
 *
 * --- Coordinates ---------------------------------------------------------
 * The simulation is in METRES, not pixels. `mx` is a world position along the
 * run (so the beaver's own mx is simply `distance`), and `y` is height above
 * the ground, positive up. Pixels exist only inside render(): `this.px` is the
 * pixels-per-metre for the current canvas.
 *
 * That split is what makes the run device-independent: `mps` (metres per
 * second) is a constant of the design, so a phone and a desktop measure the
 * same metre and the shared leaderboard compares like with like. Only the
 * viewing scale changes with the canvas.
 *
 * All drawing is procedural Canvas2D in the Beaver Games palette.
 */

import { sfx, music } from './audio.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;

/* Palette (Beaver Games design tokens). */
const C = {
  ink: '#f6efe3',
  amber: '#ffb43d',
  red: '#ff5240',
  teal: '#43e0c0',
  purple: '#7b5cff',
  fur: '#8a5a33',
  furDark: '#6b421f',
  furLight: '#b07c4a',
  belly: '#d8ab72',
  wood: '#7c5a36',
  woodDark: '#57391c',
  stone: '#5b5470',
  stoneLit: '#736a90',
  moss: '#4c7a4a',
  water: '#274a63',
  heron: '#b9b1d4',
  heronDark: '#8d85ab',
};

const METER = 42; // reference pixels per metre at u = 1

/* --- Feel constants (metres, seconds) -------------------------------------
 * Gravity is asymmetric — falling is ~1.5x heavier than rising — which is what
 * makes a jump feel snappy going up and weighty coming down. Near the apex it
 * eases off again for a moment of hang time, which is where the player reads
 * the ground and decides. None of this is physical; all of it is feel.
 */
const G_RISE = 53.5;
const G_FALL = 82;
const HANG_VY = 2.6; // |vy| under which gravity eases
const HANG_MUL = 0.6;
const JUMP_V = 18.6; // → 3.23 m apex, 0.35 s to it
const JUMP2_V = 16.7; // second jump replaces velocity, so it rescues a bad fall
/* Release while rising clips vy to this fraction of the launch. At 0.48 the
 * shortest hop peaked at 1.19 m with 0.36 s of airtime, which — once the
 * beaver's and the stump's widths are subtracted — left barely 0.3 m of ground
 * where a tap actually cleared a stump. The hop is supposed to be a usable
 * verb, not a 40 ms window, so it launches higher: ~1.6 m and 0.44 s, still
 * half the height of a held jump. */
const JUMP_CUT = 0.6;
const DIVE_V = -42;
const COYOTE = 0.10; // grace after running off a ledge
const BUFFER = 0.13; // a press this long before landing still fires
const AIRTIME = 0.694; // full held jump, apex hang included — used to size gaps

const BASE_MPS = 7.2;
const MAX_MPS_MUL = 2.55;

const ACORN_POINTS = 25;
const GOLDEN_POINTS = 250;
const SMASH_POINTS = 75;
const NEAR_MISS_POINTS = 30;
const COMBO_STEP = 5; // acorns per multiplier step
const COMBO_MAX = 5;
const COMBO_HOLD = 2.4; // seconds before the chain lapses

const FIXED = 1 / 120; // physics substep

/* --- Weather phases -------------------------------------------------------
 * Progression is visible in the sky rather than in a number: the run cycles
 * through six night-forest moods, cross-fading near the end of each. Every
 * palette stays dark, so the ink-on-night readability never breaks.
 */
const PHASE_M = 620; // metres per phase
const FADE_M = 130; // cross-fade tail

const PHASES = [
  { id: 'night', label: 'Midnight', sky: ['#141130', '#12101c', '#0b0913'], far: '#191634', near: '#221d3d', ground: '#1d1834', grit: 'rgba(123,92,255,0.25)', stars: 1, moon: 1, grass: '#2c3a5a', fx: 'fireflies' },
  { id: 'aurora', label: 'Aurora', sky: ['#0f1a2e', '#101a24', '#0a0f16'], far: '#14283a', near: '#183048', ground: '#152430', grit: 'rgba(67,224,192,0.25)', stars: 0.75, moon: 0.5, grass: '#1e4a52', fx: 'aurora' },
  { id: 'mist', label: 'Cold mist', sky: ['#232336', '#2a2a3d', '#16161f'], far: '#2b2b40', near: '#33334a', ground: '#22222f', grit: 'rgba(200,210,230,0.18)', stars: 0.1, moon: 0.15, grass: '#3d4356', fx: 'mist' },
  { id: 'rain', label: 'Downpour', sky: ['#101826', '#131a26', '#0a0e15'], far: '#16202f', near: '#1c283a', ground: '#141c28', grit: 'rgba(127,176,216,0.22)', stars: 0, moon: 0, grass: '#1e3346', fx: 'rain' },
  { id: 'storm', label: 'Storm', sky: ['#0a0a14', '#0d0d18', '#07070d'], far: '#101018', near: '#15151f', ground: '#101018', grit: 'rgba(203,214,255,0.2)', stars: 0, moon: 0, grass: '#181c2a', fx: 'storm' },
  { id: 'ember', label: 'Ember dawn', sky: ['#2b1633', '#3a1d2c', '#160c14'], far: '#3a1f2c', near: '#4a2733', ground: '#241420', grit: 'rgba(255,180,61,0.22)', stars: 0.3, moon: 0, grass: '#4a2a2e', fx: 'embers' },
];

/* --- Obstacle geometry ----------------------------------------------------
 * `mx` is always the LEFT edge. Widths that must stay jumpable are expressed
 * as a fraction of `span` — how far the beaver travels during one full jump at
 * the current speed — so they scale with the run instead of being retuned.
 */
const SPEC = {
  stump: (c) => ({ w: 0.8, h: rand(1.05, 0.72) }), // a tap tops out at ~1.32 m
  rock: (c) => ({ w: rand(1.5, 0.95), h: rand(1.1, 0.62) }),
  logs: (c) => ({ w: c.span * rand(0.44, 0.3), h: 0.78 }),
  dam: (c) => ({ w: 1.1, h: rand(4.05, 3.55) }), // above a single jump's 3.23 m apex
  gap: (c) => ({ w: c.span * rand(0.46, 0.34) }),
  /* The heron's bottom sits above a standing beaver's 0.71 m hitbox but below
   * the 1.46 m top of even the shortest possible hop, so being airborne at all
   * when it arrives is a mistake. At 1.35 the punish margin was only 0.11 m,
   * thin enough that a perfectly timed tap could slip under it and quietly
   * teach the wrong lesson. */
  heron: (c) => ({ w: 1.25, h: 0.62, y: 1.26 }),
};

const item = (kind, at, opts = null) => ({ kind, at, opts });

/* Acorns tracing the parabola the player is meant to fly, from `a` to `b`
 * metres, peaking at `peak`. The collectibles double as the level's tutorial. */
function arcOver(a, b, peak, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push(item('acorn', lerp(a, b, t), { y: 0.9 + Math.sin(t * Math.PI) * (peak - 0.9) }));
  }
  return out;
}

const line = (a, b, n, y = 1.05) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(item('acorn', lerp(a, b, n === 1 ? 0.5 : i / (n - 1)), { y }));
  return out;
};

/* --- Patterns -------------------------------------------------------------
 * Authored, not rolled. The old spawner drew each obstacle independently,
 * which happily produced a heron arriving while a log pile had the player
 * committed to the air — unavoidable, and it reads as the game cheating.
 *
 * Two invariants hold by construction here:
 *   1. No pattern mixes `heron` with `gap`. One demands you be grounded, the
 *      other demands you be airborne; together they are a coin flip.
 *   2. Every forced-air obstacle has at least ~1.5 m of solid ground after it
 *      to land on.
 * `len` is the pattern's own length in metres; the spawner adds the rest gap.
 */
const PATTERNS = [
  /* tier 0 — one verb at a time */
  { id: 'hop', tier: 0, len: 1, build: (c) => [item('stump', 0, { h: rand(1, 0.72) }), ...arcOver(-0.6, 1.6, 2.3, 4)] },
  { id: 'rock', tier: 0, len: 1.5, build: (c) => [item('rock', 0), ...arcOver(-0.7, 2.2, 2.2, 4)] },
  { id: 'coast', tier: 0, len: 3, build: (c) => line(0, 3, 5, 1.05) },
  { id: 'twoHop', tier: 0, len: 6, build: (c) => [item('stump', 0, { h: 0.8 }), item('stump', c.span * SEPARATE, { h: 0.8 })] },
  { id: 'hopPair', tier: 0, len: 3, build: (c) => [item('stump', 0, { h: 0.78 }), item('stump', c.span * TOGETHER, { h: 0.78 }), ...arcOver(-0.7, c.span * TOGETHER + 1.5, 2.7, 6)] },

  /* tier 1 — the other verbs arrive */
  { id: 'logs', tier: 1, len: 3, build: (c) => { const w = c.span * rand(0.42, 0.3); return [item('logs', 0, { w }), ...arcOver(-0.5, w + 0.9, 2.6, 5)]; } },
  { id: 'heron', tier: 1, len: 2, build: (c) => [item('heron', 0), ...line(-1.4, 2.8, 4, 0.75)] },
  { id: 'gap', tier: 1, len: 3, build: (c) => { const w = c.span * rand(0.4, 0.34); return [item('gap', 0, { w }), ...arcOver(-0.4, w + 0.8, 2.4, 5)]; } },
  { id: 'rockPair', tier: 1, len: 6, build: (c) => [item('rock', 0), item('rock', c.span * SEPARATE)] },
  { id: 'acornArc', tier: 1, len: 3, build: (c) => [item('stump', 0, { h: 0.9 }), ...arcOver(-0.8, 2.6, 3, 6)] },

  /* tier 2 — two verbs in sequence, with a landing strip between */
  { id: 'dam', tier: 2, len: 2, build: (c) => [item('dam', 0, { h: rand(3.9, 3.55) }), ...arcOver(-1, 2.4, 4.6, 6)] },
  { id: 'gapStump', tier: 2, len: 7, build: (c) => { const w = c.span * 0.36; return [item('gap', 0, { w }), item('stump', c.span * SEPARATE + w, { h: 0.85 }), ...arcOver(-0.4, w + 0.7, 2.3, 4)]; } },
  { id: 'heronStump', tier: 2, len: 5, build: (c) => [item('heron', 0), item('stump', c.span * 0.95, { h: 0.85 })] },
  { id: 'logsRock', tier: 2, len: 7, build: (c) => { const w = c.span * 0.32; return [item('logs', 0, { w }), item('rock', c.span * SEPARATE + w)]; } },
  { id: 'tripleHop', tier: 2, len: 8, build: (c) => [item('stump', 0, { h: 0.75 }), item('stump', c.span * SEPARATE, { h: 0.75 }), item('stump', c.span * SEPARATE * 2, { h: 0.75 })] },
  { id: 'wideLogs', tier: 2, len: 4, build: (c) => { const w = c.span * 0.46; return [item('logs', 0, { w }), ...arcOver(-0.6, w + 1, 2.8, 6)]; } },

  /* tier 3 — the demanding end */
  { id: 'gapGap', tier: 3, len: 9, build: (c) => { const a = c.span * 0.38, b = c.span * 0.36, at2 = c.span * SEPARATE + a; return [item('gap', 0, { w: a }), item('gap', at2, { w: b }), ...arcOver(-0.4, a + 0.6, 2.4, 4), ...arcOver(at2 - 0.4, at2 + b + 0.6, 2.4, 4)]; } },
  { id: 'gapDam', tier: 3, len: 10, build: (c) => { const w = c.span * 0.34, at2 = c.span * SEPARATE + w; return [item('gap', 0, { w }), item('dam', at2, { h: 3.7 }), ...arcOver(at2 - 1, at2 + 2.4, 4.7, 6)]; } },
  { id: 'damLogs', tier: 3, len: 9, build: (c) => [item('dam', 0, { h: 3.6 }), item('logs', c.span * AFTER_DAM, { w: c.span * 0.3 })] },
  { id: 'heronPair', tier: 3, len: 6, build: (c) => [item('heron', 0), item('heron', c.span * 0.85), ...line(-1.2, c.span * 1.4, 6, 0.75)] },
  { id: 'logsHeron', tier: 3, len: 7, build: (c) => { const w = c.span * 0.3; return [item('logs', 0, { w }), item('heron', w + c.span * 1.15)]; } },
];

const FERN_CYCLE = 30; // metres before the undergrowth repeats
const FERN_PARALLAX = 1.35; // front plane runs faster than the ground

/* --- Spacing law ----------------------------------------------------------
 * Two hazards are only fair at one of two distances apart, both measured in
 * jump spans:
 *
 *   TOGETHER  both fall inside one jump. A full jump holds the feet above
 *             rock height from 0.07 s to 0.58 s of its 0.69 s flight, so one
 *             jump covers hazards spanning up to ~0.72 span.
 *   SEPARATE  far enough to land, recover and jump again. The beaver touches
 *             down at 1.0 span, so anything from ~1.25 span is a fresh jump.
 *
 * Between those two lies a dead zone where the player lands exactly on the
 * second hazard no matter how well they time the first. That is not
 * difficulty, it is the game cheating, and it is what an unaudited random
 * spawner produces by default. `auditPatterns()` enforces this.
 */
const TOGETHER = 0.4;
const SEPARATE = 1.35;
const AFTER_DAM = 2.0; // a dam needs a double jump, which flies ~1.55 span

/* Checks every pattern against the rules the table is meant to obey. Called by
 * the test harness across a sweep of speeds; cheap enough to keep shipped so
 * the law lives next to the thing it governs.
 *
 * @returns {string[]} one message per violation, empty when the table is sound.
 */
export function auditPatterns(span) {
  const bad = [];
  const JUMP_WINDOW = 0.72; // span covered with the feet above rock height
  const LAND_AGAIN = 1.25; // span after which a fresh jump is available

  for (const p of PATTERNS) {
    // Sample repeatedly: several patterns randomise their widths.
    for (let trial = 0; trial < 60; trial++) {
      const items = p.build({ span, tier: p.tier });
      const hazards = [];
      let hasHeron = false;
      let hasGap = false;
      for (const it of items) {
        if (it.kind === 'acorn') continue;
        const spec = SPEC[it.kind]({ span, tier: p.tier });
        const w = it.opts?.w ?? spec.w;
        if (it.kind === 'heron') {
          hasHeron = true;
          continue; // never requires a jump, so exempt from the spacing law
        }
        if (it.kind === 'gap') hasGap = true;
        hazards.push({ kind: it.kind, at: it.at, w });
      }

      if (hasHeron && hasGap) bad.push(`${p.id}: heron shares a pattern with a gap`);
      for (const h of hazards) {
        if (h.kind === 'gap' && h.w > span * 0.55) bad.push(`${p.id}: gap ${h.w.toFixed(2)} too wide for a ${span.toFixed(2)} span`);
        if (h.kind === 'logs' && h.w > span * JUMP_WINDOW) bad.push(`${p.id}: log raft ${h.w.toFixed(2)} wider than one jump`);
      }

      hazards.sort((a, b) => a.at - b.at);
      for (let i = 1; i < hazards.length; i++) {
        const prev = hazards[i - 1];
        const cur = hazards[i];
        const gapAfterDam = prev.kind === 'dam';
        const together = cur.at + cur.w - prev.at <= span * JUMP_WINDOW;
        const separate = cur.at - prev.at >= span * (gapAfterDam ? AFTER_DAM * 0.9 : LAND_AGAIN);
        if (!together && !separate) {
          bad.push(
            `${p.id}: ${prev.kind}→${cur.kind} at ${((cur.at - prev.at) / span).toFixed(2)} span lands the player on the second`
          );
        }
      }
    }
  }
  return [...new Set(bad)];
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu'; // menu | playing | paused | dead
    this.time = 0;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.hooks = {};
    this._raf = null;
    this._last = 0;
    this._acc = 0;
    this.bestDistance = 0;
    this.menuDrift = 0;
    this.resize();
    this.resetWorld();
  }

  /* A list per event, not one slot. With a single slot the second `on('hud')`
   * silently replaced the first, which is exactly how the HUD stopped updating
   * when the coaching lines were added — no error, just a frozen score. */
  on(name, fn) {
    (this.hooks[name] || (this.hooks[name] = [])).push(fn);
  }

  emit(name, ...args) {
    const list = this.hooks[name];
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](...args);
  }

  /* ---------------------------------------------------------------- sizing -- */

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(280, Math.round(rect.width || window.innerWidth));
    this.h = Math.max(240, Math.round(rect.height || window.innerHeight));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The view scale takes the SMALLER of what width and height can afford.
    // Deriving it from height alone (as this used to) meant a tall narrow
    // phone drew a huge world into a narrow viewport, which collapsed the
    // warning time on an approaching obstacle to under half a second.
    this.u = clamp(Math.min(this.w / 760, this.h / 430), 0.68, 1.9);
    this.px = METER * this.u; // pixels per metre
    this.groundY = Math.round(this.h - clamp(this.h * 0.2, 84 * this.u, 150 * this.u));
    this.bx = Math.round(this.w * 0.26); // beaver's fixed screen x

    this.buildStatics();
    this._skyKey = '';
  }

  /** Seeded decoration that only depends on canvas size. */
  buildStatics() {
    const starN = Math.round((this.w * this.h) / 9000);
    this.starList = [];
    for (let i = 0; i < starN; i++) {
      this.starList.push({
        x: rand(this.w),
        y: rand(this.groundY * 0.85),
        s: rand(2.2, 0.7) * this.u,
        a: rand(0.9, 0.2),
        tw: rand(TAU),
      });
    }
    // Four parallax bands: distant ridge, far treeline, near treeline, ferns.
    this.layers = [
      { k: 'ridge', mul: 0.10, yFrac: 0.52, line: this.makeRidge(210, 66) },
      { k: 'far', mul: 0.22, yFrac: 0.66, line: this.makeTreeline(66, 30) },
      { k: 'near', mul: 0.44, yFrac: 0.78, line: this.makeTreeline(48, 52) },
    ];
    this.layerOff = this.layers.map(() => 0);
    // Frond lengths are baked here, not at draw time: rolling them per frame
    // makes the undergrowth twitch.
    this.ferns = [];
    for (let i = 0; i < 26; i++) {
      const n = 3 + ((Math.random() * 3) | 0);
      const lens = [];
      for (let k = 0; k < n; k++) lens.push(rand(1.05, 0.8));
      this.ferns.push({ at: rand(FERN_CYCLE), h: rand(26, 12), lean: rand(0.5, -0.5), n, lens });
    }
    this.pebbles = [];
    for (let i = 0; i < 40; i++) this.pebbles.push({ at: rand(40), y: rand(0.85, 0.1), r: rand(2.6, 0.9) });
  }

  makeTreeline(step, height) {
    const pts = [];
    const n = Math.ceil(this.w / (step * this.u)) + 4;
    for (let i = 0; i < n; i++) {
      pts.push({
        h: rand(height * 1.55, height * 0.55) * this.u,
        w: rand(step * 1.15, step * 0.7) * this.u,
        lean: rand(0.18, -0.18),
      });
    }
    return { pts };
  }

  makeRidge(step, height) {
    const pts = [];
    const n = Math.ceil(this.w / (step * this.u)) + 4;
    for (let i = 0; i < n; i++) pts.push({ h: rand(height * 1.3, height * 0.4) * this.u, w: rand(step * 1.3, step * 0.8) * this.u });
    return { pts };
  }

  /* ----------------------------------------------------------------- world -- */

  resetWorld() {
    this.mps = BASE_MPS;
    this.distance = 0;
    this.score = 0;
    this.acorns = 0;
    this.goldenTaken = 0;
    this.smashes = 0;
    this.nearMisses = 0;
    this.milestone = 500;
    this.obstacles = [];
    this.gaps = [];
    this.pickups = [];
    this.particles = [];
    this.popups = [];
    this.acornPoints = 0;
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.shield = 0;
    this.invuln = 0;
    this.shake = 0;
    this.flash = 0;
    this.lightning = 0;
    this.nextStrike = rand(9, 4);
    this.tier = 0;
    this.recent = [];
    this.stepPhase = 0;
    this.deathCause = null;
    // A quiet opening: the first pattern lands ~3 seconds in, so a run never
    // dies before the player's hands are on the button.
    this.spawnM = 22;
    this.jumpBuf = 0;
    this.jumpHeld = false;

    this.beaver = {
      y: 0,
      vy: 0,
      w: 1.1,
      h: 0.81,
      onGround: true,
      jumps: 0,
      coyote: COYOTE,
      diving: false,
      runT: 0,
      tumble: 0,
      blink: 0,
      squash: 0,
      stretch: 0,
      scarf: [],
    };
    for (let i = 0; i < 6; i++) this.beaver.scarf.push({ x: 0, y: 0 });
  }

  /* One full jump's horizontal reach, in metres — the yardstick every width
   * that has to stay clearable is measured against. */
  get span() {
    return AIRTIME * this.mps;
  }

  /** Is there solid ground under this world position? */
  solidAt(mx) {
    for (let i = 0; i < this.gaps.length; i++) {
      const g = this.gaps[i];
      if (mx > g.mx && mx < g.mx + g.w) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ loop -- */

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.25) dt = FIXED; // returning from a background tab
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  newRun() {
    this.resetWorld();
    this.state = 'playing';
    this._acc = 0;
    music.start();
    music.tier(0);
    this.emit('run-start');
    this.emit('hud');
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    music.stop();
    this.emit('pause', true);
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this._acc = 0;
    this.jumpHeld = false;
    this.jumpBuf = 0;
    music.start();
    this.emit('pause', false);
    return true;
  }

  frame(dt) {
    this.time += dt;
    if (this.state === 'playing') {
      // Fixed substeps: at 30 fps a single 33 ms step would move the beaver
      // most of a metre, which is enough to pass straight through a stump.
      this._acc += dt;
      let steps = 0;
      while (this._acc >= FIXED && steps < 12) {
        this._acc -= FIXED;
        steps++;
        this.step(FIXED);
        if (this.state !== 'playing') break;
      }
      if (steps >= 12) this._acc = 0;
      if (this.state === 'playing') this.emit('hud');
    } else if (this.state === 'dead') {
      this.updateDead(dt);
    } else if (this.state === 'menu') {
      this.updateMenu(dt);
    }
    this.render();
  }

  /* ---------------------------------------------------------------- update -- */

  step(dt) {
    const b = this.beaver;

    /* --- pace --- */
    this.mps = Math.min(BASE_MPS * MAX_MPS_MUL, BASE_MPS * (1 + this.distance / 2400));
    this.distance += this.mps * dt;

    const tier = this.distance < 340 ? 0 : this.distance < 950 ? 1 : this.distance < 2100 ? 2 : 3;
    if (tier !== this.tier) {
      this.tier = tier;
      music.tier(tier);
    }

    if (this.distance >= this.milestone) {
      sfx.milestone();
      // Announced by the HUD toast only — a canvas popup as well just puts two
      // copies of the same number on screen.
      this.emit('milestone', this.milestone);
      this.milestone += 500;
      this.flash = this.reduceMotion ? 0 : 0.22;
    }

    /* --- jump buffering: a press just before landing still counts --- */
    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if (b.onGround || b.coyote > 0) {
        this.jumpBuf = 0;
        this.doJump(1);
      }
    }

    /* --- vertical motion --- */
    let g = b.vy > 0 ? G_RISE : G_FALL;
    if (Math.abs(b.vy) < HANG_VY && !b.diving) g *= HANG_MUL; // apex hang
    b.vy -= g * dt;
    b.y += b.vy * dt;

    // Supported while the trailing foot still has ground, so a take-off from
    // the very lip of a gap counts.
    const solid = this.solidAt(this.distance - b.w * 0.25);
    if (b.y <= 0 && solid) {
      if (!b.onGround) {
        const hard = b.diving || b.vy < -14;
        sfx.land(hard);
        b.squash = clamp(-b.vy / 20, 0.25, 1);
        this.dust(hard ? 14 : 6);
        if (b.diving) {
          this.shake = this.reduceMotion ? 0 : 9;
          this.ring(this.distance, 0);
        }
      }
      b.y = 0;
      b.vy = 0;
      b.onGround = true;
      b.diving = false;
      b.jumps = 0;
      b.coyote = COYOTE;
    } else {
      if (b.onGround) b.coyote = COYOTE; // just left the ground (or a ledge)
      b.onGround = false;
      b.coyote = Math.max(0, b.coyote - dt);
      // Fell into a gap.
      if (b.y < -1.6) {
        this.crash({ kind: 'gap' });
        return;
      }
    }

    /* --- animation state --- */
    b.squash = Math.max(0, b.squash - dt * 6);
    b.stretch = Math.max(0, b.stretch - dt * 5);
    b.blink = Math.max(0, b.blink - dt);
    if (chance(dt * 0.4)) b.blink = 0.12;
    if (b.onGround) {
      const prev = b.runT;
      b.runT += dt * this.mps * 1.35;
      this.stepPhase = b.runT;
      if (Math.floor(prev * 2) !== Math.floor(b.runT * 2)) sfx.step();
    }
    this.updateScarf(dt);

    /* --- timers --- */
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0 && this.combo > 0) {
        this.combo = 0;
        this.mult = 1;
      }
    }
    this.shake *= Math.pow(0.002, dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.lightning = Math.max(0, this.lightning - dt * 3.2);

    /* --- storm --- */
    const ph = this.phaseAt(this.distance);
    if (ph.now.fx === 'storm' || ph.next.fx === 'storm') {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = rand(11, 4.5);
        if (!this.reduceMotion) this.lightning = 1;
        sfx.thunder();
      }
    }

    /* --- spawning --- */
    if (this.distance + this.leadM() > this.spawnM) this.spawnPattern();

    /* --- obstacles --- */
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (o.kind === 'heron') {
        o.t += dt;
        // Bobs UPWARD only. A symmetric bob would dip the hitbox into a
        // grounded beaver, which would break the one promise the heron makes.
        o.y = o.baseY + (0.5 + 0.5 * Math.sin(o.t * 4)) * 0.14;
      }
      if (o.mx + o.w < this.distance - 4) {
        this.obstacles.splice(i, 1);
        continue;
      }
      // Track the tightest clearance while alongside, for the near-miss bonus.
      if (!o.done && Math.abs(o.mx + o.w * 0.5 - this.distance) < (o.w + b.w) * 0.6) {
        const c = this.clearance(b, o);
        o.clear = o.clear === undefined ? c : Math.min(o.clear, c);
      }
      if (!o.done && o.mx + o.w < this.distance - b.w * 0.3) {
        o.done = true;
        if (o.clear !== undefined && o.clear > 0 && o.clear < 0.42) {
          this.nearMisses++;
          sfx.whoosh();
          this.pop(this.bx, this.groundY - (b.y + b.h + 0.5) * this.px, 'CLOSE!', C.amber, 0.75);
        }
        continue;
      }
      if (this.overlaps(b, o)) {
        if (this.resolveHit(o, i)) return;
      }
    }

    /* --- gaps: retire once behind --- */
    for (let i = this.gaps.length - 1; i >= 0; i--) {
      if (this.gaps[i].mx + this.gaps[i].w < this.distance - 4) this.gaps.splice(i, 1);
    }

    /* --- pickups --- */
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (p.mx < this.distance - 3) {
        this.pickups.splice(i, 1);
        continue;
      }
      const dx = p.mx - this.distance;
      const dy = p.y - (b.y + b.h * 0.5);
      if (dx * dx + dy * dy < 0.62 * 0.62) {
        this.pickups.splice(i, 1);
        this.take(p);
      }
    }

    /* --- juice --- */
    this.updateParticles(dt);
    this.updatePopups(dt);
    if (b.onGround && chance(dt * 16)) this.dust(1);
    this.scoreNow();
  }

  /* Warning distance: how far ahead of the beaver a pattern is born. The
   * off-screen margin is generous on purpose — at top speed the on-screen part
   * alone is under a second of reaction time, and a pattern that needs two
   * presses (dam, gap-then-dam) wants every millisecond of that. */
  leadM() {
    return (this.w - this.bx + 220 * this.u) / this.px;
  }

  scoreNow() {
    this.score =
      Math.floor(this.distance) +
      this.acornPoints +
      this.goldenTaken * GOLDEN_POINTS +
      this.smashes * SMASH_POINTS +
      this.nearMisses * NEAR_MISS_POINTS;
  }

  take(p) {
    const b = this.beaver;
    const sy = this.groundY - p.y * this.px;
    const sx = this.bx + (p.mx - this.distance) * this.px;
    if (p.kind === 'shield') {
      this.shield = 1;
      sfx.shieldUp();
      this.burst(sx, sy, C.teal, 18);
      this.pop(sx, sy, 'SHIELD', C.teal, 1);
      this.emit('pickup', 'shield');
      return;
    }
    if (p.kind === 'golden') {
      this.goldenTaken++;
      sfx.golden();
      this.burst(sx, sy, C.amber, 16);
      this.pop(sx, sy, `+${GOLDEN_POINTS}`, C.amber, 1);
      this.emit('pickup', 'golden');
      return;
    }
    this.acorns++;
    this.combo++;
    this.comboT = COMBO_HOLD;
    const nextMult = clamp(1 + Math.floor(this.combo / COMBO_STEP), 1, COMBO_MAX);
    if (nextMult !== this.mult) {
      this.mult = nextMult;
      sfx.combo(this.mult);
      this.pop(sx, sy - 26 * this.u, `x${this.mult}`, C.teal, 1.1);
    } else {
      sfx.acorn(this.combo);
    }
    this.acornPoints = (this.acornPoints || 0) + ACORN_POINTS * this.mult;
    this.burst(sx, sy, C.teal, 6);
  }

  /** Vertical gap between the two boxes, in metres (negative = overlapping). */
  clearance(b, o) {
    const by0 = b.y + 0.02;
    const by1 = b.y + b.h * 0.88;
    const oy0 = o.kind === 'heron' ? o.y : 0;
    const oy1 = o.kind === 'heron' ? o.y + o.h : o.h;
    if (by0 > oy1) return by0 - oy1;
    if (oy0 > by1) return oy0 - by1;
    return -1;
  }

  overlaps(b, o) {
    const bx0 = this.distance - b.w * 0.3;
    const bx1 = this.distance + b.w * 0.3;
    if (bx1 < o.mx + o.w * 0.08 || bx0 > o.mx + o.w * 0.92) return false;
    return this.clearance(b, o) < 0;
  }

  /** @returns true if the run ended. */
  resolveHit(o, idx) {
    const b = this.beaver;
    if (this.invuln > 0) return false;

    // Tail slam: a committed dive smashes the small stuff.
    if (b.diving && (o.kind === 'stump' || o.kind === 'rock')) {
      this.obstacles.splice(idx, 1);
      this.smashes++;
      sfx.smash();
      const sx = this.bx + (o.mx + o.w * 0.5 - this.distance) * this.px;
      this.debris(sx, this.groundY - o.h * this.px * 0.5, o.kind === 'rock' ? C.stone : C.wood);
      this.pop(sx, this.groundY - o.h * this.px - 18 * this.u, `+${SMASH_POINTS}`, C.amber, 0.9);
      this.shake = this.reduceMotion ? 0 : 7;
      b.vy = 7.5; // a little bounce out of the smash
      b.diving = false;
      b.jumps = 1;
      return false;
    }

    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 1.1;
      sfx.shieldBreak();
      if (o.kind !== 'heron') this.obstacles.splice(idx, 1);
      const sx = this.bx + (o.mx + o.w * 0.5 - this.distance) * this.px;
      this.burst(sx, this.groundY - (o.y + o.h * 0.5) * this.px, C.teal, 22);
      this.pop(this.bx, this.groundY - (b.y + b.h + 0.6) * this.px, 'SAVED!', C.teal, 1);
      this.shake = this.reduceMotion ? 0 : 10;
      this.emit('shield-lost');
      return false;
    }

    this.crash(o);
    return true;
  }

  updateScarf(dt) {
    const b = this.beaver;
    const s = b.scarf;
    // Trails from the neck; each knot chases the one ahead, plus the apparent
    // wind from running, which is what sells the speed. Kept short and high so
    // it streams above the tail instead of tangling with it.
    s[0].x = -0.2;
    s[0].y = b.h * 0.78;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const k = s[i];
      const tx = a.x - 0.1;
      const ty = a.y - 0.01;
      k.x += (tx - k.x) * Math.min(1, dt * 26);
      k.y += (ty - k.y) * Math.min(1, dt * 20);
      k.x -= dt * this.mps * 0.015;
      k.y += b.onGround ? Math.sin(b.runT * 6 + i) * 0.012 : -b.vy * 0.003;
      k.x = clamp(k.x, -0.82, 0.05);
      k.y = clamp(k.y, b.h * 0.45, b.h * 1.15);
    }
  }

  updateMenu(dt) {
    const b = this.beaver;
    b.runT += dt * 5;
    this.stepPhase = b.runT;
    // The menu keeps the forest moving without advancing the run.
    this.menuDrift += BASE_MPS * 0.45 * dt;
    this.updateScarf(dt);
    this.updateParticles(dt);
    if (chance(dt * 12)) this.dust(1);
  }

  updateDead(dt) {
    const b = this.beaver;
    b.tumble += dt * 8;
    b.vy -= G_FALL * 0.5 * dt;
    b.y += b.vy * dt;
    if (b.y < -3) b.y = -3;
    this.updateParticles(dt);
    this.updatePopups(dt);
    this.shake *= Math.pow(0.002, dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (!p.float) p.vy += 900 * this.u * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin !== undefined) p.rot += p.spin * dt;
    }
  }

  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 34 * this.u * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  pop(x, y, text, color, size = 1) {
    if (this.popups.length > 14) this.popups.shift();
    this.popups.push({ x, y, text, color, size, life: 0.85, max: 0.85 });
  }

  burst(x, y, color, n) {
    if (this.reduceMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(200, 40) * this.u;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60 * this.u,
        life: rand(0.55, 0.2),
        max: 0.55,
        size: rand(3.6, 1.6) * this.u,
        color,
      });
    }
  }

  debris(x, y, color) {
    const n = this.reduceMotion ? 5 : 16;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y,
        vx: rand(40, -260) * this.u,
        vy: -rand(320, 60) * this.u,
        life: rand(0.8, 0.35),
        max: 0.8,
        size: rand(5, 2) * this.u,
        color,
        rot: rand(TAU),
        spin: rand(12, -12),
      });
    }
  }

  ring(mx, y) {
    // Flat shockwave from a landed dive.
    const x = this.bx + (mx - this.distance) * this.px;
    for (let i = 0; i < (this.reduceMotion ? 4 : 12); i++) {
      const dir = i % 2 ? 1 : -1;
      this.particles.push({
        x, y: this.groundY - y * this.px,
        vx: dir * rand(340, 120) * this.u,
        vy: -rand(90, 20) * this.u,
        life: rand(0.4, 0.2),
        max: 0.4,
        size: rand(4, 2) * this.u,
        color: 'rgba(220,210,240,0.6)',
      });
    }
  }

  dust(n) {
    if (this.reduceMotion) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: this.bx - this.beaver.w * 0.35 * this.px,
        y: this.groundY - rand(3, 0) * this.u,
        vx: -rand(150, 40) * this.u,
        vy: -rand(80, 10) * this.u,
        life: rand(0.45, 0.2),
        max: 0.45,
        size: rand(3.4, 1.4) * this.u,
        color: 'rgba(150,132,165,0.45)',
      });
    }
  }

  /* -------------------------------------------------------------- spawning -- */

  spawnPattern() {
    const c = { span: this.span, tier: this.tier };
    // Unlocked tiers only, weighted towards the newest one so the run keeps
    // introducing something, and never a pattern seen in the last three.
    const unlocked = PATTERNS.filter((p) => p.tier <= this.tier && !this.recent.includes(p.id));
    const fresh = unlocked.filter((p) => p.tier === this.tier);
    const pool = fresh.length && chance(0.55) ? fresh : unlocked;
    const p = pick(pool.length ? pool : PATTERNS.filter((x) => x.tier <= this.tier));
    this.recent.push(p.id);
    if (this.recent.length > 3) this.recent.shift();

    const base = this.spawnM;
    let end = base + p.len;
    for (const it of p.build(c)) {
      const mx = base + it.at;
      const o = it.opts || {};
      if (it.kind === 'acorn') {
        this.pickups.push({ kind: 'acorn', mx, y: o.y ?? 1.05, t: rand(TAU) });
        continue;
      }
      const spec = SPEC[it.kind](c);
      const w = o.w ?? spec.w;
      const h = o.h ?? spec.h;
      if (it.kind === 'gap') {
        this.gaps.push({ mx, w });
        end = Math.max(end, mx + w);
        continue;
      }
      const y = it.kind === 'heron' ? (o.y ?? spec.y) : 0;
      this.obstacles.push({ kind: it.kind, mx, w, h, y, baseY: y, t: rand(TAU) });
      end = Math.max(end, mx + w);
    }

    // A rare treat, always over solid ground and clear of the pattern.
    if (chance(0.1)) this.pickups.push({ kind: 'golden', mx: end + rand(3, 1.2), y: rand(3.2, 1.6), t: 0 });
    else if (this.distance > 380 && chance(0.055)) this.pickups.push({ kind: 'shield', mx: end + rand(3, 1.2), y: rand(2.6, 1.4), t: 0 });

    /* The fairness floor. Rest is measured in SECONDS of reaction time, not
     * metres: the run gets harder because the window shrinks, not because the
     * spacing shrinks — at 2.5x speed a fixed metre gap would be 2.5x tighter
     * than it read at the start, which is how a ramp turns into a wall. */
    const restSec = lerp(1.2, 0.7, clamp(this.distance / 2600, 0, 1)) * rand(1.25, 1);
    this.spawnM = end + restSec * this.mps;
  }

  /* ------------------------------------------------------------------ death -- */

  crash(o) {
    this.state = 'dead';
    const b = this.beaver;
    this.deathCause = o.kind;
    this.scoreNow(); // report the score as of this instant, not the last substep
    b.vy = o.kind === 'gap' ? -2 : 11;
    b.tumble = 0.01;
    this.shake = this.reduceMotion ? 0 : 15;
    this.flash = this.reduceMotion ? 0 : 0.38;
    const sy = this.groundY - (b.y + b.h * 0.5) * this.px;
    this.burst(this.bx, sy, C.fur, 14);
    this.burst(this.bx, sy, C.red, 9);
    music.stop();
    if (o.kind === 'gap') sfx.splash();
    else sfx.crash();
    setTimeout(() => sfx.gameover(), 450);
    this.emit('gameover', {
      score: this.score,
      distance: Math.floor(this.distance),
      acorns: this.acorns,
      golden: this.goldenTaken,
      smashes: this.smashes,
      nearMisses: this.nearMisses,
      cause: o.kind,
    });
  }

  /* ----------------------------------------------------------------- input -- */

  /** One button. Ground → jump, air → double jump, air again → dive. */
  jumpDown() {
    if (this.state !== 'playing') return false;
    const b = this.beaver;
    this.jumpHeld = true;

    if (b.onGround || b.coyote > 0) return this.doJump(1);
    if (b.jumps === 1) return this.doJump(2);
    if (!b.diving && b.jumps >= 2) {
      b.diving = true;
      b.vy = DIVE_V;
      sfx.dive();
      this.burst(this.bx, this.groundY - (b.y + b.h) * this.px, 'rgba(246,239,227,0.55)', 8);
      return true;
    }
    // Nothing left — remember the press in case we land in the next 130 ms.
    this.jumpBuf = BUFFER;
    return false;
  }

  doJump(which) {
    const b = this.beaver;
    b.vy = which === 1 ? JUMP_V : JUMP2_V;
    b.onGround = false;
    b.coyote = 0;
    b.diving = false;
    b.jumps = which;
    b.stretch = 1;
    b.squash = 0;
    sfx.jump(which === 2);
    if (which === 2) this.burst(this.bx, this.groundY - (b.y + b.h * 0.2) * this.px, 'rgba(246,239,227,0.65)', 8);
    else this.dust(5);
    return true;
  }

  jumpUp() {
    const b = this.beaver;
    // Variable height: releasing while still rising clips the climb, so a tap
    // is a hop and a hold is the full jump. Without this the only jump the
    // player has is the maximum one.
    if (this.state === 'playing' && b.vy > JUMP_V * JUMP_CUT && !b.diving) b.vy = JUMP_V * JUMP_CUT;
    this.jumpHeld = false;
  }

  /* ---------------------------------------------------------------- render -- */

  phaseAt(distance) {
    const raw = distance / PHASE_M;
    const i = Math.floor(raw) % PHASES.length;
    const into = (raw - Math.floor(raw)) * PHASE_M;
    const t = into > PHASE_M - FADE_M ? (into - (PHASE_M - FADE_M)) / FADE_M : 0;
    return { now: PHASES[i], next: PHASES[(i + 1) % PHASES.length], t, index: i };
  }

  render() {
    const ctx = this.ctx;
    const u = this.u;
    const b = this.beaver;
    const ph = this.phaseAt(this.state === 'menu' ? 0 : this.distance);
    const mix = (key) => blend(ph.now[key], ph.next[key], ph.t);

    this.drawSky(ctx, ph, mix);

    ctx.save();
    if (this.shake > 0.3) {
      const s = this.shake;
      ctx.translate(rand(s, -s) * 0.5, rand(s, -s) * 0.5);
    }

    this.drawParallax(ctx, ph, mix);
    this.drawWeather(ctx, ph, false);
    this.drawGround(ctx, mix);
    this.drawBestFlag(ctx);

    for (const g of this.gaps) this.drawGap(ctx, g, mix);
    for (const p of this.pickups) this.drawPickup(ctx, p);
    for (const o of this.obstacles) this.drawShadow(ctx, o);
    this.drawBeaverShadow(ctx);
    for (const o of this.obstacles) this.drawObstacle(ctx, o);
    this.drawBeaver(ctx);
    this.drawParticles(ctx);
    this.drawFerns(ctx, mix);
    this.drawWeather(ctx, ph, true);
    this.drawSpeedLines(ctx);
    this.drawPopups(ctx);

    ctx.restore();

    this.drawVignette(ctx);
    if (this.lightning > 0.01) {
      ctx.globalAlpha = this.lightning * 0.5;
      ctx.fillStyle = '#dfe6ff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(1, this.flash);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(12,10,20,0.55)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  drawSky(ctx, ph, mix) {
    // The gradient object is rebuilt only when its colours actually change,
    // and the cross-fade is quantised so that happens ~30 times per phase
    // rather than every frame.
    const q = Math.round(ph.t * 24) / 24;
    const key = `${ph.index}:${q}:${this.w}x${this.h}`;
    if (key !== this._skyKey) {
      const a = ph.now.sky;
      const bs = ph.next.sky;
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, blend(a[0], bs[0], q));
      g.addColorStop(0.58, blend(a[1], bs[1], q));
      g.addColorStop(1, blend(a[2], bs[2], q));
      this._sky = g;
      this._skyKey = key;
    }
    ctx.fillStyle = this._sky;
    ctx.fillRect(0, 0, this.w, this.h);

    const starA = lerp(ph.now.stars, ph.next.stars, ph.t);
    if (starA > 0.02) {
      ctx.fillStyle = C.ink;
      for (const s of this.starList) {
        ctx.globalAlpha = starA * s.a * (0.65 + 0.35 * Math.sin(this.time * 1.6 + s.tw));
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }

    const moonA = lerp(ph.now.moon, ph.next.moon, ph.t);
    if (moonA > 0.02) this.drawMoon(ctx, moonA);
    const emberA = (ph.now.fx === 'embers' ? 1 - ph.t : 0) + (ph.next.fx === 'embers' ? ph.t : 0);
    if (emberA > 0.02) this.drawHorizonGlow(ctx, emberA);
  }

  drawMoon(ctx, a) {
    const mx = this.w * 0.79;
    const my = this.groundY * 0.24;
    const r = 26 * this.u;
    ctx.globalAlpha = a * 0.32;
    const halo = ctx.createRadialGradient(mx, my, r * 0.5, mx, my, r * 3.2);
    halo.addColorStop(0, 'rgba(255,180,61,0.85)');
    halo.addColorStop(1, 'rgba(255,180,61,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - r * 3.2, my - r * 3.2, r * 6.4, r * 6.4);
    ctx.globalAlpha = a;
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(18,16,28,0.22)';
    ctx.beginPath();
    ctx.arc(mx - r * 0.3, my - r * 0.22, r * 0.22, 0, TAU);
    ctx.arc(mx + r * 0.26, my + r * 0.3, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawHorizonGlow(ctx, a) {
    const y = this.groundY;
    const g = ctx.createLinearGradient(0, y - 190 * this.u, 0, y);
    g.addColorStop(0, 'rgba(255,82,64,0)');
    g.addColorStop(0.6, 'rgba(255,110,60,0.16)');
    g.addColorStop(1, 'rgba(255,180,61,0.4)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 190 * this.u, this.w, 190 * this.u);
    ctx.globalAlpha = 1;
  }

  drawParallax(ctx, ph, mix) {
    // Offsets derive from distance rather than accumulating, so they stay in
    // step with the world across a pause, a resize or a dropped frame.
    for (let i = 0; i < this.layers.length; i++) {
      this.layerOff[i] = (this.distance + this.menuDrift) * this.layers[i].mul * this.px;
    }

    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const pts = layer.line.pts;
      const y = this.groundY * layer.yFrac + this.groundY * 0.16;
      ctx.fillStyle = layer.k === 'ridge' ? mix('far') : layer.k === 'far' ? mix('far') : mix('near');
      if (layer.k === 'ridge') ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(0, this.h);
      ctx.lineTo(0, y);
      let total = 0;
      for (const p of pts) total += p.w;
      let off = this.layerOff[i] % total;
      let k = 0;
      let x = -off;
      // Walk back to the first shape that touches the viewport.
      while (x + pts[k % pts.length].w < 0) {
        x += pts[k % pts.length].w;
        k++;
      }
      let guard = 0;
      while (x < this.w + 40 * this.u && guard++ < 400) {
        const p = pts[k % pts.length];
        if (layer.k === 'ridge') {
          ctx.lineTo(x + p.w * 0.5, y - p.h);
          ctx.lineTo(x + p.w, y - p.h * 0.15);
        } else {
          // A conifer: trunk shoulder, leaning tip, shoulder back down.
          const tip = x + p.w * (0.5 + p.lean * 0.4);
          ctx.lineTo(x + p.w * 0.16, y - p.h * 0.2);
          ctx.lineTo(x + p.w * 0.3, y - p.h * 0.35);
          ctx.lineTo(x + p.w * 0.2, y - p.h * 0.45);
          ctx.lineTo(x + p.w * 0.34, y - p.h * 0.62);
          ctx.lineTo(x + p.w * 0.26, y - p.h * 0.7);
          ctx.lineTo(tip, y - p.h);
          ctx.lineTo(x + p.w * 0.74, y - p.h * 0.7);
          ctx.lineTo(x + p.w * 0.66, y - p.h * 0.62);
          ctx.lineTo(x + p.w * 0.8, y - p.h * 0.45);
          ctx.lineTo(x + p.w * 0.7, y - p.h * 0.35);
          ctx.lineTo(x + p.w * 0.84, y - p.h * 0.2);
        }
        ctx.lineTo(x + p.w, y);
        x += p.w;
        k++;
      }
      ctx.lineTo(this.w, this.h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawGround(ctx, mix) {
    const u = this.u;
    const gy = this.groundY;

    // No full-width water strip: it drew a hard line straight across every
    // chasm, which read as the river bridging the thing you have to jump.
    // Water now appears only inside gaps, where it means something.

    // Soil, punched through wherever there is a gap, with a lit grass edge and
    // a strata line so the bank has a readable thickness.
    const soil = mix('ground');
    const segs = this.groundSegments();
    for (const [x0, x1] of segs) {
      const wd = x1 - x0;
      ctx.fillStyle = soil;
      ctx.fillRect(x0, gy, wd, this.h - gy);
      ctx.fillStyle = mix('grass');
      ctx.fillRect(x0, gy - 1 * u, wd, 4 * u);
      ctx.fillStyle = 'rgba(246,239,227,0.07)';
      ctx.fillRect(x0, gy + 3 * u, wd, 2 * u);
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(x0, gy + 17 * u, wd, 2 * u);
    }

    // Grit in the soil, placed in world metres on a repeating cycle so it
    // scrolls with the ground instead of crawling against it.
    ctx.fillStyle = mix('grit');
    const cycle = 40;
    const anchor = Math.floor((this.distance - 2) / cycle) * cycle;
    for (const pb of this.pebbles) {
      for (let k = 0; k < 2; k++) {
        const base = anchor + k * cycle + pb.at;
        const sx = this.bx + (base - this.distance) * this.px;
        if (sx < -10 || sx > this.w + 10) continue;
        if (!this.solidAt(base)) continue;
        ctx.fillRect(sx, gy + 8 * u + pb.y * (this.h - gy) * 0.5, pb.r * u * 2, pb.r * u);
      }
    }
  }

  /** Screen-space runs of solid ground, split by any visible gap. */
  groundSegments() {
    const out = [];
    const edges = [];
    for (const g of this.gaps) {
      const x0 = this.bx + (g.mx - this.distance) * this.px;
      const x1 = x0 + g.w * this.px;
      if (x1 < -20 || x0 > this.w + 20) continue;
      edges.push([x0, x1]);
    }
    edges.sort((a, b) => a[0] - b[0]);
    let cursor = -20;
    for (const [x0, x1] of edges) {
      if (x0 > cursor) out.push([cursor, x0]);
      cursor = Math.max(cursor, x1);
    }
    if (cursor < this.w + 20) out.push([cursor, this.w + 20]);
    return out;
  }

  /* The gap is the one hazard defined by absence, so it has to be drawn
   * emphatically or it reads as a flat black rectangle. Three things carry it:
   * water high enough in the throat to be visible, undercut lips that show the
   * bank has thickness, and a bright grass fringe marking the exact take-off
   * and landing points. */
  drawGap(ctx, g, mix) {
    const u = this.u;
    const x0 = this.bx + (g.mx - this.distance) * this.px;
    const wpx = g.w * this.px;
    if (x0 + wpx < -20 || x0 > this.w + 20) return;
    const gy = this.groundY;
    const depth = this.h - gy;
    const waterY = gy + depth * 0.42;

    // Throat.
    const grad = ctx.createLinearGradient(0, gy, 0, waterY);
    grad.addColorStop(0, '#05040a');
    grad.addColorStop(1, '#0a1220');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, gy, wpx, waterY - gy);

    // Water, with glints sliding along it.
    const wg = ctx.createLinearGradient(0, waterY, 0, this.h);
    wg.addColorStop(0, '#2f5c78');
    wg.addColorStop(1, C.water);
    ctx.fillStyle = wg;
    ctx.fillRect(x0, waterY, wpx, this.h - waterY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, waterY, wpx, this.h - waterY);
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = C.teal;
    for (let i = 0; i < 4; i++) {
      const ww = wpx * 0.42;
      const travel = (this.time * 30 * u + i * 53 * u) % (wpx + ww * 2);
      ctx.fillRect(x0 - ww + travel, waterY + 5 * u + i * 7 * u, ww, 1.5 * u);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Undercut lips: soil face, then a lit grass fringe on the very edge.
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0, gy, 6 * u, depth * 0.3);
    ctx.fillRect(x0 + wpx - 6 * u, gy, 6 * u, depth * 0.3);
    const grassCol = mix('grass');
    for (const lipX of [x0, x0 + wpx]) {
      const dir = lipX === x0 ? -1 : 1;
      ctx.fillStyle = grassCol;
      ctx.fillRect(lipX + (dir < 0 ? -11 * u : -3 * u), gy - 2 * u, 14 * u, 5 * u);
      ctx.fillStyle = C.moss;
      ctx.fillRect(lipX + (dir < 0 ? -9 * u : -2 * u), gy - 4 * u, 11 * u, 3 * u);
      // A couple of blades overhanging the drop.
      ctx.strokeStyle = C.moss;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const bx = lipX + dir * (1 + i * 2.6) * u;
        ctx.moveTo(bx, gy - 2 * u);
        ctx.lineTo(bx + dir * 2 * u, gy - 8 * u - i * 1.5 * u);
      }
      ctx.stroke();
    }
  }

  drawShadow(ctx, o) {
    const u = this.u;
    const cx = this.bx + (o.mx + o.w * 0.5 - this.distance) * this.px;
    if (cx < -100 || cx > this.w + 100) return;
    if (!this.solidAt(o.mx + o.w * 0.5)) return;
    const height = o.kind === 'heron' ? o.y : 0;
    const fade = clamp(1 - height / 4, 0.15, 1);
    ctx.globalAlpha = 0.4 * fade;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, this.groundY + 3 * u, o.w * this.px * 0.55 * fade, 4.5 * u * fade, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBeaverShadow(ctx) {
    const b = this.beaver;
    if (!this.solidAt(this.distance)) return;
    const fade = clamp(1 - b.y / 3.4, 0.12, 1);
    ctx.globalAlpha = 0.45 * fade;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(this.bx, this.groundY + 3 * this.u, b.w * this.px * 0.5 * fade, 5 * this.u * fade, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBestFlag(ctx) {
    if (!this.bestDistance || this.state !== 'playing') return;
    const dx = this.bestDistance - this.distance;
    if (dx < -1 || dx > this.leadM()) return;
    const u = this.u;
    const x = this.bx + dx * this.px;
    const gy = this.groundY;
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = C.purple;
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([6 * u, 6 * u]);
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy - 78 * u);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.purple;
    ctx.beginPath();
    ctx.moveTo(x, gy - 78 * u);
    ctx.lineTo(x + 26 * u, gy - 71 * u);
    ctx.lineTo(x, gy - 62 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `700 ${9 * u}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('BEST', x + 4 * u, gy - 69 * u);
    ctx.globalAlpha = 1;
  }

  /* Undergrowth in the very front plane, scrolling faster than the ground to
   * sell depth. Positions repeat on a fixed cycle in world metres. */
  drawFerns(ctx, mix) {
    const u = this.u;
    const gy = this.groundY;
    const cyclePx = FERN_CYCLE * this.px * FERN_PARALLAX;
    const scroll = (this.distance + this.menuDrift) * this.px * FERN_PARALLAX;
    ctx.strokeStyle = 'rgba(10,8,16,0.92)';
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    for (const f of this.ferns) {
      let x = f.at * this.px * FERN_PARALLAX - (scroll % cyclePx);
      if (x < -50 * u) x += cyclePx;
      if (x > this.w + 50 * u) continue;
      const sway = Math.sin(this.time * 2 + f.at) * 2 * u;
      ctx.beginPath();
      for (let i = 0; i < f.n; i++) {
        const a = -Math.PI / 2 + (i - (f.n - 1) / 2) * 0.42 + f.lean * 0.3;
        const len = f.h * u * f.lens[i];
        ctx.moveTo(x, gy + 6 * u);
        ctx.quadraticCurveTo(
          x + Math.cos(a) * len * 0.5 + sway,
          gy + 6 * u + Math.sin(a) * len * 0.6,
          x + Math.cos(a) * len + sway * 1.6,
          gy + 6 * u + Math.sin(a) * len
        );
      }
      ctx.stroke();
    }
  }

  drawWeather(ctx, ph, front) {
    const w1 = 1 - ph.t;
    const w2 = ph.t;
    if (w1 > 0.02) this.drawFx(ctx, ph.now.fx, w1, front);
    if (w2 > 0.02) this.drawFx(ctx, ph.next.fx, w2, front);
  }

  drawFx(ctx, fx, a, front) {
    const u = this.u;
    switch (fx) {
      case 'aurora': {
        if (front) return;
        for (let i = 0; i < 3; i++) {
          const base = this.groundY * (0.2 + i * 0.1);
          const g = ctx.createLinearGradient(0, base - 70 * u, 0, base + 60 * u);
          g.addColorStop(0, 'rgba(67,224,192,0)');
          g.addColorStop(0.5, i % 2 ? 'rgba(123,92,255,0.3)' : 'rgba(67,224,192,0.3)');
          g.addColorStop(1, 'rgba(67,224,192,0)');
          ctx.globalAlpha = a * 0.7;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, base);
          for (let x = 0; x <= this.w; x += 24 * u) {
            ctx.lineTo(x, base + Math.sin(x * 0.006 + this.time * (0.5 + i * 0.2) + i) * 24 * u);
          }
          ctx.lineTo(this.w, base + 60 * u);
          ctx.lineTo(0, base + 60 * u);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      case 'mist': {
        if (front) return;
        ctx.globalAlpha = a * 0.5;
        for (let i = 0; i < 4; i++) {
          const y = this.groundY - (10 + i * 34) * u;
          const off = (this.distance * this.px * (0.05 + i * 0.03)) % (this.w + 200 * u);
          const g = ctx.createLinearGradient(0, y - 20 * u, 0, y + 20 * u);
          g.addColorStop(0, 'rgba(190,200,220,0)');
          g.addColorStop(0.5, 'rgba(190,200,220,0.28)');
          g.addColorStop(1, 'rgba(190,200,220,0)');
          ctx.fillStyle = g;
          ctx.fillRect(-off, y - 20 * u, this.w + 200 * u, 40 * u);
          ctx.fillRect(-off + this.w + 200 * u, y - 20 * u, this.w + 200 * u, 40 * u);
        }
        ctx.globalAlpha = 1;
        return;
      }
      case 'rain':
      case 'storm': {
        if (!front) return;
        const n = fx === 'storm' ? 110 : 80;
        ctx.strokeStyle = fx === 'storm' ? 'rgba(203,214,255,0.5)' : 'rgba(127,176,216,0.45)';
        ctx.lineWidth = 1.3 * u;
        ctx.globalAlpha = a;
        ctx.beginPath();
        const fall = this.time * 1400 * u;
        for (let i = 0; i < n; i++) {
          // Deterministic scatter: no per-drop state to keep.
          const seed = i * 12.9898;
          const sx = ((Math.sin(seed) * 43758.5) % 1) * this.w;
          const sp = 0.75 + (((Math.sin(seed * 1.7) * 24634.6) % 1) + 1) * 0.25;
          const y = ((fall * sp + i * 91) % (this.groundY + 120 * u)) - 60 * u;
          const len = 16 * u * sp;
          ctx.moveTo(sx < 0 ? sx + this.w : sx, y);
          ctx.lineTo((sx < 0 ? sx + this.w : sx) - 5 * u, y + len);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      case 'embers': {
        if (!front) return;
        ctx.globalAlpha = a;
        for (let i = 0; i < 26; i++) {
          const seed = i * 7.31;
          const sx = (((Math.sin(seed) * 43758.5) % 1) + 1) * 0.5 * this.w;
          const t = (this.time * (0.1 + (i % 5) * 0.03) + i * 0.37) % 1;
          const y = this.groundY - t * this.groundY * 0.9;
          const x = sx + Math.sin(this.time * 0.8 + i) * 16 * u;
          ctx.fillStyle = i % 3 ? C.amber : C.red;
          ctx.globalAlpha = a * (1 - t) * 0.85;
          const s = (1.6 + (i % 3)) * u;
          ctx.fillRect(x, y, s, s);
        }
        ctx.globalAlpha = 1;
        return;
      }
      case 'fireflies': {
        if (!front) return;
        ctx.globalAlpha = a;
        for (let i = 0; i < 14; i++) {
          const seed = i * 3.77;
          const bx = (((Math.sin(seed) * 43758.5) % 1) + 1) * 0.5 * this.w;
          const by = this.groundY - 20 * u - (((Math.sin(seed * 2.1) * 12345.7) % 1) + 1) * 0.5 * this.groundY * 0.45;
          const x = bx + Math.sin(this.time * 0.7 + i * 1.3) * 30 * u;
          const y = by + Math.cos(this.time * 0.55 + i) * 18 * u;
          const pulse = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 2.2 + i));
          ctx.globalAlpha = a * pulse * 0.8;
          ctx.fillStyle = C.amber;
          ctx.beginPath();
          ctx.arc(x, y, 2.2 * u, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
      }
      default:
        return;
    }
  }

  /* Ground blur. Streaks anywhere above the horizon read as scratches on the
   * artwork — over the treeline especially — so these live in the soil band,
   * where "the ground is rushing past" is the only thing they can mean. */
  drawSpeedLines(ctx) {
    const over = (this.mps - BASE_MPS * 1.5) / (BASE_MPS * (MAX_MPS_MUL - 1.5));
    if (over <= 0 || this.reduceMotion || this.state !== 'playing') return;
    const u = this.u;
    const top = this.groundY + 7 * u;
    const band = Math.max(10, this.h - top - 4 * u);
    ctx.globalAlpha = clamp(over, 0, 1) * 0.28;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const seed = i * 5.13;
      const y = top + (((Math.sin(seed) * 43758.5) % 1) + 1) * 0.5 * band;
      const len = (22 + (i % 4) * 14) * u;
      const x = this.w - ((this.time * 1700 * u + i * 170 * u) % (this.w + len * 2));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawVignette(ctx) {
    if (!this._vig || this._vigKey !== `${this.w}x${this.h}`) {
      const g = ctx.createRadialGradient(this.w * 0.5, this.groundY * 0.72, Math.min(this.w, this.h) * 0.34, this.w * 0.5, this.groundY * 0.72, Math.max(this.w, this.h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
      this._vig = g;
      this._vigKey = `${this.w}x${this.h}`;
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.rot !== undefined) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPopups(ctx) {
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      const t = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = t;
      ctx.font = `700 ${Math.round(16 * p.size * this.u)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(12,10,20,0.7)';
      ctx.fillText(p.text, p.x + 2 * this.u, p.y + 2 * this.u);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawPickup(ctx, p) {
    const u = this.u;
    const x = this.bx + (p.mx - this.distance) * this.px;
    if (x < -40 * u || x > this.w + 40 * u) return;
    const y = this.groundY - p.y * this.px + Math.sin(p.t * 5) * 3 * u;
    const r = (p.kind === 'acorn' ? 8 : 12) * u;

    ctx.save();
    ctx.translate(x, y);
    if (p.kind === 'shield') {
      ctx.rotate(Math.sin(p.t * 2) * 0.2);
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = C.teal;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.9 + Math.sin(p.t * 7) * 2 * u, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // A fern-leaf shield.
      ctx.fillStyle = C.teal;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.95, -r * 0.2, 0, r);
      ctx.quadraticCurveTo(-r * 0.95, -r * 0.2, 0, -r);
      ctx.fill();
      ctx.strokeStyle = '#0e3a33';
      ctx.lineWidth = 1.3 * u;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.lineTo(0, r * 0.9);
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(0, i * r * 0.32);
        ctx.lineTo(r * 0.5, i * r * 0.32 + r * 0.18);
        ctx.moveTo(0, i * r * 0.32);
        ctx.lineTo(-r * 0.5, i * r * 0.32 + r * 0.18);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (p.kind === 'golden') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = C.amber;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8 + Math.sin(p.t * 8) * 2 * u, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Acorn: body, then the cap with its little stalk.
    ctx.fillStyle = p.kind === 'golden' ? C.amber : '#c98d4e';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.7, r * 0.78, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.kind === 'golden' ? '#b57b13' : C.woodDark;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.82, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(-r * 0.1, -r * 0.98, r * 0.2, r * 0.42);
    ctx.fillStyle = 'rgba(246,239,227,0.35)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.24, r * 0.16, r * 0.14, r * 0.24, 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawObstacle(ctx, o) {
    const u = this.u;
    const x = this.bx + (o.mx - this.distance) * this.px;
    const wpx = o.w * this.px;
    if (x + wpx < -60 * u || x > this.w + 60 * u) return;
    const gy = this.groundY;
    ctx.save();
    ctx.translate(x, gy);

    switch (o.kind) {
      case 'stump': {
        const hp = o.h * this.px;
        ctx.fillStyle = C.woodDark;
        ctx.fillRect(0, -hp, wpx, hp);
        ctx.fillStyle = C.wood;
        ctx.fillRect(2.5 * u, -hp, wpx - 5 * u, hp);
        // Roots splaying into the soil.
        ctx.fillStyle = C.woodDark;
        ctx.beginPath();
        ctx.moveTo(-6 * u, 2 * u);
        ctx.lineTo(wpx * 0.2, -hp * 0.24);
        ctx.lineTo(wpx * 0.4, 2 * u);
        ctx.moveTo(wpx + 6 * u, 2 * u);
        ctx.lineTo(wpx * 0.8, -hp * 0.24);
        ctx.lineTo(wpx * 0.6, 2 * u);
        ctx.fill();
        // Cut top with rings.
        ctx.fillStyle = '#8d6740';
        ctx.beginPath();
        ctx.ellipse(wpx * 0.5, -hp, wpx * 0.5, 5.5 * u, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(87,57,28,0.8)';
        ctx.lineWidth = 1.2 * u;
        for (const f of [0.62, 0.34]) {
          ctx.beginPath();
          ctx.ellipse(wpx * 0.5, -hp, wpx * 0.5 * f, 5.5 * u * f, 0, 0, TAU);
          ctx.stroke();
        }
        // Moss cap.
        ctx.fillStyle = C.moss;
        ctx.beginPath();
        ctx.ellipse(wpx * 0.22, -hp + 1 * u, wpx * 0.22, 3 * u, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'rock': {
        const hp = o.h * this.px;
        ctx.fillStyle = C.stone;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(wpx * 0.16, -hp * 0.82);
        ctx.lineTo(wpx * 0.52, -hp);
        ctx.lineTo(wpx * 0.84, -hp * 0.66);
        ctx.lineTo(wpx, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.stoneLit;
        ctx.beginPath();
        ctx.moveTo(wpx * 0.16, -hp * 0.82);
        ctx.lineTo(wpx * 0.52, -hp);
        ctx.lineTo(wpx * 0.46, 0);
        ctx.lineTo(wpx * 0.1, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.moss;
        ctx.beginPath();
        ctx.ellipse(wpx * 0.46, -hp * 0.9, wpx * 0.14, 2.4 * u, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(12,10,20,0.4)';
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(wpx * 0.52, -hp);
        ctx.lineTo(wpx * 0.6, -hp * 0.4);
        ctx.stroke();
        break;
      }
      case 'logs': {
        // A low, wide raft of logs — the shape says "long jump", not "hop".
        const lh = o.h * this.px * 0.52;
        const drawLog = (lx, ly, len) => {
          ctx.fillStyle = C.wood;
          ctx.fillRect(lx, ly - lh, len, lh);
          ctx.fillStyle = C.woodDark;
          ctx.fillRect(lx, ly - lh, len, 3 * u);
          ctx.fillRect(lx, ly - lh * 0.34, len, 1.6 * u);
          ctx.beginPath();
          ctx.ellipse(lx + len, ly - lh / 2, 4.5 * u, lh / 2, 0, 0, TAU);
          ctx.fillStyle = '#8d6740';
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(lx + len, ly - lh / 2, 2 * u, lh / 4, 0, 0, TAU);
          ctx.fillStyle = C.woodDark;
          ctx.fill();
        };
        drawLog(0, 0, wpx * 0.94);
        drawLog(wpx * 0.06, -lh, wpx * 0.8);
        drawLog(wpx * 0.2, -lh * 2, wpx * 0.5);
        ctx.strokeStyle = '#3a2b1c';
        ctx.lineWidth = 2.4 * u;
        ctx.beginPath();
        ctx.moveTo(wpx * 0.34, -lh * 2.1);
        ctx.lineTo(wpx * 0.3, 0);
        ctx.stroke();
        break;
      }
      case 'dam': {
        // Tall by design: above a single jump's apex, so it reads as "twice".
        const hp = o.h * this.px;
        ctx.fillStyle = '#3d2a17';
        ctx.fillRect(-2 * u, -hp, wpx + 4 * u, hp);
        const rows = Math.max(4, Math.round(hp / (11 * u)));
        for (let i = 0; i < rows; i++) {
          const ry = -hp + (i * hp) / rows;
          ctx.fillStyle = i % 2 ? C.wood : '#6a4a2c';
          ctx.fillRect(i % 2 ? 0 : 2 * u, ry, wpx - (i % 2 ? 0 : 4 * u), (hp / rows) * 0.72);
          ctx.fillStyle = 'rgba(24,18,10,0.55)';
          ctx.fillRect(0, ry + (hp / rows) * 0.72, wpx, (hp / rows) * 0.28);
        }
        // Sticks poking out, mud packing, mossy crown.
        ctx.strokeStyle = '#4a3420';
        ctx.lineWidth = 2.2 * u;
        for (let i = 0; i < 5; i++) {
          const sy = -hp * (0.15 + i * 0.18);
          ctx.beginPath();
          ctx.moveTo(i % 2 ? 0 : wpx, sy);
          ctx.lineTo(i % 2 ? -9 * u : wpx + 9 * u, sy - 4 * u);
          ctx.stroke();
        }
        ctx.fillStyle = '#3c6440';
        ctx.beginPath();
        ctx.ellipse(wpx * 0.5, -hp, wpx * 0.52, 3.4 * u, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(246,239,227,0.14)';
        ctx.fillRect(0, -hp, 3 * u, hp);
        break;
      }
      case 'heron': {
        const hp = o.h * this.px;
        const cy = -o.y * this.px - hp * 0.5;
        const flap = Math.sin(o.t * 11);
        ctx.translate(wpx * 0.5, cy);
        // Far wing first, so the near one overlaps it.
        for (const side of [-1, 1]) {
          ctx.fillStyle = side < 0 ? C.heronDark : C.heron;
          ctx.beginPath();
          ctx.moveTo(0, -hp * 0.1);
          ctx.quadraticCurveTo(wpx * 0.26, -hp * (0.5 + flap * side * 0.85), wpx * 0.52, -hp * (0.1 + flap * side * 0.5));
          ctx.quadraticCurveTo(wpx * 0.2, hp * 0.1, 0, hp * 0.05);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = C.heron;
        ctx.beginPath();
        ctx.ellipse(0, 0, wpx * 0.3, hp * 0.4, 0, 0, TAU);
        ctx.fill();
        // Neck folded back, head forward, dagger beak.
        ctx.strokeStyle = C.heron;
        ctx.lineWidth = 4.2 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-wpx * 0.22, hp * 0.02);
        ctx.quadraticCurveTo(-wpx * 0.42, -hp * 0.5, -wpx * 0.5, -hp * 0.26);
        ctx.stroke();
        ctx.fillStyle = C.amber;
        ctx.beginPath();
        ctx.moveTo(-wpx * 0.5, -hp * 0.32);
        ctx.lineTo(-wpx * 0.78, -hp * 0.2);
        ctx.lineTo(-wpx * 0.5, -hp * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#241f3d';
        ctx.beginPath();
        ctx.arc(-wpx * 0.46, -hp * 0.3, 1.9 * u, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#6f6795';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(wpx * 0.2, hp * 0.3);
        ctx.lineTo(wpx * 0.5, hp * 0.44);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawBeaver(ctx) {
    const u = this.u;
    const b = this.beaver;
    const px = this.px;
    ctx.save();
    ctx.translate(this.bx, this.groundY - b.y * px);

    if (this.state === 'dead') ctx.rotate(b.tumble);
    else if (b.diving) ctx.rotate(0.85);
    else if (!b.onGround) ctx.rotate(clamp(-b.vy / 46, -0.3, 0.34));

    // Squash on landing, stretch on take-off: the cheapest way to make a jump
    // read as weight rather than a translation.
    const sx = 1 + b.squash * 0.26 - b.stretch * 0.14;
    const sy = 1 - b.squash * 0.26 + b.stretch * 0.18;
    ctx.scale(sx, sy);
    if (this.invuln > 0 && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;

    const w = b.w * px;
    const h = b.h * px;
    const run = Math.sin(b.runT * TAU);

    /* Scarf — drawn behind everything, tapering to a point. */
    ctx.strokeStyle = C.red;
    ctx.lineCap = 'round';
    for (let i = 1; i < b.scarf.length; i++) {
      const a = b.scarf[i - 1];
      const k = b.scarf[i];
      ctx.lineWidth = (7 - i) * u * 0.9;
      ctx.beginPath();
      ctx.moveTo(a.x * px, -a.y * px);
      ctx.lineTo(k.x * px, -k.y * px);
      ctx.stroke();
    }

    /* Tail: flat paddle, slapping in time with the stride. */
    ctx.save();
    ctx.translate(-w * 0.4, -h * 0.4);
    ctx.rotate(-0.45 + (b.onGround ? run * 0.2 : b.diving ? 0.6 : -0.3));
    ctx.fillStyle = C.furDark;
    ctx.beginPath();
    ctx.ellipse(-w * 0.26, 0, w * 0.32, h * 0.23, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,16,28,0.5)';
    ctx.lineWidth = 1.2 * u;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.48, i * h * 0.09);
      ctx.lineTo(-w * 0.06, i * h * 0.09);
      ctx.stroke();
    }
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.36 + i * w * 0.1, -h * 0.16);
      ctx.lineTo(-w * 0.36 + i * w * 0.1, h * 0.16);
      ctx.stroke();
    }
    ctx.restore();

    /* Back legs. */
    ctx.strokeStyle = C.furDark;
    ctx.lineWidth = 5.5 * u;
    ctx.lineCap = 'round';
    const swing = b.onGround ? run : b.diving ? -0.9 : 0.55;
    ctx.beginPath();
    ctx.moveTo(-w * 0.13, -h * 0.18);
    ctx.lineTo(-w * 0.13 + swing * w * 0.16, b.onGround ? 0 : -h * 0.04);
    ctx.moveTo(w * 0.13, -h * 0.18);
    ctx.lineTo(w * 0.13 - swing * w * 0.16, b.onGround ? 0 : -h * 0.04);
    ctx.stroke();

    /* Body. */
    const bob = b.onGround ? Math.abs(run) * h * 0.05 : 0;
    ctx.save();
    ctx.translate(0, -h * 0.54 - bob);
    if (!this._furGrad || this._furH !== h) {
      const g = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      g.addColorStop(0, C.furLight);
      g.addColorStop(0.52, C.fur);
      g.addColorStop(1, C.furDark);
      this._furGrad = g;
      this._furH = h;
    }
    ctx.fillStyle = this._furGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.43, h * 0.52, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(w * 0.09, h * 0.15, w * 0.23, h * 0.31, 0, 0, TAU);
    ctx.fill();

    /* Head. */
    ctx.save();
    ctx.translate(w * 0.31, -h * 0.31);
    ctx.fillStyle = C.fur;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.25, h * 0.33, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.furDark;
    ctx.beginPath();
    ctx.arc(-w * 0.11, -h * 0.27, w * 0.075, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5a3417';
    ctx.beginPath();
    ctx.arc(-w * 0.11, -h * 0.27, w * 0.04, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(w * 0.13, h * 0.11, w * 0.14, h * 0.15, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241f3d';
    ctx.beginPath();
    ctx.ellipse(w * 0.21, h * 0.02, w * 0.05, h * 0.045, 0, 0, TAU);
    ctx.fill();
    // The teeth. Non-negotiable.
    ctx.fillStyle = C.ink;
    ctx.fillRect(w * 0.14, h * 0.17, w * 0.05, h * 0.13);
    ctx.fillRect(w * 0.2, h * 0.17, w * 0.05, h * 0.13);
    ctx.strokeStyle = 'rgba(18,16,28,0.4)';
    ctx.lineWidth = 0.9 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.195, h * 0.17);
    ctx.lineTo(w * 0.195, h * 0.3);
    ctx.stroke();
    // Eye — squeezed shut on a dive or a crash.
    const shut = b.blink > 0 || this.state === 'dead' || b.diving;
    if (shut) {
      ctx.strokeStyle = '#241f3d';
      ctx.lineWidth = 1.7 * u;
      ctx.beginPath();
      ctx.moveTo(w * 0.02, -h * 0.08);
      ctx.lineTo(w * 0.11, -h * 0.06);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#241f3d';
      ctx.beginPath();
      ctx.arc(w * 0.07, -h * 0.07, w * 0.048, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(w * 0.085, -h * 0.088, w * 0.016, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* Front paw. */
    ctx.strokeStyle = C.furDark;
    ctx.lineWidth = 4.2 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.19, -h * 0.05);
    ctx.lineTo(w * 0.31, h * 0.06 + (b.onGround ? run * h * 0.06 : -h * 0.1));
    ctx.stroke();
    ctx.restore();

    /* Shield bubble. */
    if (this.shield > 0) {
      ctx.strokeStyle = C.teal;
      ctx.lineWidth = 2 * u;
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.time * 5);
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.5, w * 0.72, h * 0.85, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

/* --- colour helpers ------------------------------------------------------- */

const hexCache = new Map();
function parseHex(hex) {
  let v = hexCache.get(hex);
  if (!v) {
    v = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    hexCache.set(hex, v);
  }
  return v;
}

/** Blend two colours. Passes rgba() strings through unchanged at the ends so
 *  the palette can mix hex fills and pre-baked rgba accents in one table. */
function blend(a, b, t) {
  if (t <= 0.001) return a;
  if (t >= 0.999) return b;
  if (a[0] !== '#' || b[0] !== '#') return t < 0.5 ? a : b;
  const A = parseHex(a);
  const B = parseHex(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
