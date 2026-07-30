/*
 * Orbit Cadet — game layer: table state, missions, ranks, and rendering.
 *
 * The physics lives in physics.js and the geometry in table.js. This module owns
 * the rules and the pixels, and it is the only one that knows the canvas exists.
 *
 * Rendering works by pushing a single transform that maps the fixed 560 x 1000
 * table space onto the canvas, letterboxed. Everything below then draws in table
 * units, so a lamp at (256, 372) is at (256, 372) whatever the screen is. There
 * is no size-versus-visibility tension here the way there is in a scrolling
 * game: the whole table is always on screen, so a phone simply gets a smaller
 * one and a desktop gets the margins filled with the backglass.
 */

import { stepBall, stepFlipper, makeBall, BALL_R, SURF } from './physics.js';
import { buildTable, BOUNDARY, RANKS, TABLE_W, TABLE_H } from './table.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);

/* The palette is the original's: a deep navy playfield printed with cyan line
 * art, chrome rails, and amber/green inserts. The first pass was purple felt
 * with teal decals, which read as a generic neon table rather than the
 * blue-and-steel space cabinet this is meant to be. */
const C = {
  deep: '#05091d', // the letterbox and the darkest felt
  felt: '#0c1740',
  feltLit: '#17275f',
  line: '#7fc9ff', // the cyan everything is printed in
  ink: '#eaf3ff',
  dim: '#8fa3cc',
  amber: '#ffc24a',
  red: '#ff5240',
  green: '#4ef0a0',
  chrome: '#ccd9ee',
  chromeMid: '#7b8cad',
  chromeDark: '#232c4a',
  rubber: '#e0483a',
  ball: '#e8edf8',
  lampOff: '#16203f',
};

/* Three bumper caps, so the cluster reads as three things rather than one. */
const BUMPER_CAP = [['#ffd88a', '#c8631d'], ['#a8e8ff', '#1f6ea8'], ['#ffb3a8', '#a83224']];

const BALLS_PER_GAME = 3;
const TILT_LIMIT = 3; // nudges banked before the table tilts

/* Scores. Pinball numbers are big on purpose — the jump from 500 to 25,000 for a
 * mission is the whole reason to chase missions instead of bumpers. */
const PTS = {
  wall: 0,
  bumper: 500,
  sling: 110,
  target: 1200,
  bankClear: 6000,
  spinner: 260,
  fuel: 350,
  fuelBank: 4000,
  orbit: 5200,
  inlane: 400,
  selector: 800,
  mission: 25000,
  rank: 12000,
};

/* --- Missions -------------------------------------------------------------
 * Roll over the mission target to arm one, then complete its objective. Each is
 * a small counter rather than a script, which is what keeps adding more cheap.
 */
const MISSIONS = [
  { id: 'targets', name: 'TARGET PRACTICE', goal: 3, hint: 'Drop all three targets' },
  { id: 'beacons', name: 'BEACON SWEEP', goal: 12, hint: 'Hit the bumpers 12 times' },
  { id: 'orbit', name: 'ORBIT RUN', goal: 3, hint: 'Shoot the left orbit 3 times' },
  { id: 'spin', name: 'SPIN CYCLE', goal: 20, hint: 'Pass the spinner 20 times' },
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu'; // menu | playing | paused | over
    this.hooks = {};
    this.time = 0;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._raf = null;
    this._last = 0;
    this._acc = 0;
    this.table = buildTable();
    this.resize();
    this.resetGame();
  }

  on(name, fn) {
    (this.hooks[name] || (this.hooks[name] = [])).push(fn);
  }

  emit(name, ...args) {
    const list = this.hooks[name];
    if (!list) return;
    for (const fn of list) fn(...args);
  }

  /* ---------------------------------------------------------------- sizing -- */

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(240, Math.round(rect.width || window.innerWidth));
    this.h = Math.max(320, Math.round(rect.height || window.innerHeight));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the whole table, letterboxed, with a little breathing room.
    const pad = 8;
    this.scale = Math.min((this.w - pad * 2) / TABLE_W, (this.h - pad * 2) / TABLE_H);
    this.offX = (this.w - TABLE_W * this.scale) / 2;
    this.offY = (this.h - TABLE_H * this.scale) / 2;
    const wasWide = this.wide;
    this.wide = this.offX > 70; // room beside the table for the backglass
    this.bakeArt();
    /* Tell the shell which of the two score displays should be showing. With the
     * backglass drawn there is no reason for the DOM HUD to repeat it, and in
     * landscape the two overlapped and printed the score twice. */
    if (wasWide !== this.wide) this.emit('layout', this.wide);
  }

  /* ----------------------------------------------------------------- state -- */

  resetGame() {
    this.score = 0;
    this.ballNo = 1;
    this.ballsLeft = BALLS_PER_GAME;
    this.rankIdx = 0;
    this.extraBallAwarded = false;
    this.missionsDone = 0;
    this.resetTable();
    this.balls = [];
    this.popups = [];
    this.particles = [];
    this.flashes = [];
    this.shake = 0;
    this.tiltWarn = 0;
    this.tilted = false;
    this.nudgeBank = 0;
    this.nudgeX = 0;
    this.nudgeY = 0;
    this.plunger = 0;
    this.plungerHeld = false;
    this.message = '';
    this.messageT = 0;
    this.newBall();
  }

  /** Per-ball table reset: targets back up, mission cleared. */
  resetTable() {
    for (const t of this.table.targets) t.off = false;
    this.mission = null;
    this.missionProgress = 0;
    this.missionArmed = false;
    this.bumperHits = 0;
    this.spins = 0;
    this.orbits = 0;
    this.lampT = {};
    this.multiball = false;
    this.fuel = [false, false, false];
    this.bonusX = 1;
  }

  newBall() {
    const s = this.table.ballStart;
    this.balls = [makeBall(s.x, s.y, 0, 0)];
    this.plunger = 0;
    this.inLane = true;
    this.laneArmed = false;
    this.tilted = false;
    this.nudgeBank = 0;
  }

  get rank() {
    return RANKS[Math.min(this.rankIdx, RANKS.length - 1)];
  }

  /* ------------------------------------------------------------------ loop -- */

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.25) dt = 1 / 120;
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  newGame() {
    this.resetGame();
    this.state = 'playing';
    this._acc = 0;
    this.say('BALL 1', 1.4);
    this.emit('hud');
  }

  pause() {
    if (this.state !== 'playing') return false;
    this.state = 'paused';
    this.emit('pause', true);
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = 'playing';
    this._acc = 0;
    this.emit('pause', false);
    return true;
  }

  frame(dt) {
    this.time += dt;
    if (this.state === 'playing') {
      // A fixed 1/120 step keeps the ball's behaviour identical whatever the
      // display refresh is; the physics substeps further on top of this.
      const STEP = 1 / 120;
      this._acc += dt;
      let n = 0;
      while (this._acc >= STEP && n < 16) {
        this._acc -= STEP;
        n++;
        this.step(STEP);
      }
      if (n >= 16) this._acc = 0;
      this.emit('hud');
    }
    this.updateVisuals(dt);
    this.render();
  }

  /* ---------------------------------------------------------------- update -- */

  step(dt) {
    const table = this.table;

    for (const f of table.flippers) stepFlipper(f, dt);

    // Nudge decays fast — it is a shove, not a thruster.
    this.nudgeX *= Math.pow(0.02, dt);
    this.nudgeY *= Math.pow(0.02, dt);
    this.nudgeBank = Math.max(0, this.nudgeBank - dt * 0.55);
    this.tiltWarn = Math.max(0, this.tiltWarn - dt);

    const world = {
      solids: table.solids,
      flippers: this.tilted ? [] : table.flippers, // a tilted table is dead
      nudgeX: this.nudgeX,
      nudgeY: this.nudgeY,
      onHit: (o, v) => this.onHit(o, v),
      onFlipperHit: (f, v) => sfx.clack(v * 1.6),
    };

    // Held in the plunger lane until launched.
    if (this.inLane && this.balls.length === 1) {
      const b = this.balls[0];
      b.x = table.ballStart.x;
      b.y = table.ballStart.y - this.plunger * 26;
      b.vx = 0;
      b.vy = 0;
    }

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (this.inLane && this.balls.length === 1) break;
      stepBall(b, dt, world);
      this.checkSensors(b, dt);

      /* Back down the plunger lane is a re-launch, not a loss — and at ANY speed.
       * Requiring |vy| < 220 meant a ball returning from the dome, which arrives
       * fast, sailed past the check and out of the bottom of the lane as a lost
       * ball. That is a large part of why balls seemed to vanish down the right
       * without the player getting a shot.
       *
       * Armed only once the ball has climbed out of the lane, because it starts
       * inside this region and an unarmed check fires on the launch frame. A
       * `vy > 0` test looks like it does the same job and does not: a weak plunge
       * that dribbles back settles on the lane floor at a few units per second of
       * float, never registers a downward frame, and sits there for the rest of
       * the game with the plunger disarmed. */
      if (b.y < 900) this.laneArmed = true;
      if (this.laneArmed && b.x > table.laneX0 && b.y > 930 && this.balls.length === 1) {
        this.inLane = true;
        this.laneArmed = false;
        this.plunger = 0;
        continue;
      }

      // Only the playfield drains; the lane is handled above.
      if (b.y > table.drainY && b.x < table.laneX0) {
        this.balls.splice(i, 1);
        this.onDrain();
      }
    }
  }

  onHit(o, v) {
    if (o.bumper !== undefined) {
      this.add(PTS.bumper);
      this.bumperHits++;
      this.lamp(`bumper${o.bumper}`, 0.3);
      sfx.bumper(v);
      this.burst(o.cx, o.cy, C.amber, 6);
      if (this.mission?.id === 'beacons') this.progress();
      return;
    }
    if (o.sling) {
      this.add(PTS.sling);
      this.lamp(`sling${o.sling}`, 0.2);
      sfx.sling();
      return;
    }
    if (o.target !== undefined && !o.off) {
      o.off = true;
      this.add(PTS.target);
      this.lamp(`target${o.target}`, 4);
      sfx.target(o.target);
      this.pop(o.x1 + 20, o.y1 + 12, `${PTS.target}`, C.line);
      if (this.mission?.id === 'targets') this.progress();
      if (this.table.targets.every((t) => t.off)) {
        this.add(PTS.bankClear);
        this.say('BANK CLEAR', 1.4);
        sfx.bankClear();
        // Reset the bank after a beat so it can be shot again.
        setTimeout(() => {
          if (this.state === 'playing') for (const t of this.table.targets) t.off = false;
        }, 1400);
      }
      return;
    }
    sfx.clack(v);
  }

  checkSensors(b, dt) {
    for (const s of this.table.sensors) {
      const inside = Math.hypot(b.x - s.x, b.y - s.y) < s.r + BALL_R * 0.4;
      const wasIn = s._in || false;
      if (s.need === 'up' && b.vy > -60) {
        s._in = inside;
        continue;
      }
      if (inside && !wasIn) this.onSensor(s, b);
      s._in = inside;
    }
  }

  onSensor(s, b) {
    switch (s.id) {
      case 'orbit':
        this.add(PTS.orbit);
        this.orbits++;
        this.say('ORBIT', 1);
        this.pop(s.x, s.y, `${PTS.orbit}`, C.amber);
        sfx.orbit();
        if (this.mission?.id === 'orbit') this.progress();
        break;
      case 'spinner':
        this.add(PTS.spinner);
        this.spins++;
        this.lamp('spinner', 0.25);
        sfx.spinner(this.spins);
        if (this.mission?.id === 'spin') this.progress();
        break;
      case 'selector':
        this.lamp('selector', 0.6);
        if (!this.mission) this.armMission();
        else this.add(PTS.selector);
        break;
      case 'inlaneL':
      case 'inlaneR':
        this.add(PTS.inlane);
        this.lamp(s.id === 'inlaneL' ? 'inlaneL' : 'inlaneR', 0.5);
        break;
      case 'fuel0':
      case 'fuel1':
      case 'fuel2':
        this.onFuel(s.fuel);
        break;
      default:
        break;
    }
    void b;
  }

  /* The three lanes across the top of the dome. Light all three and the bonus
   * multiplier steps up — which is the reward for a hard plunge, since every
   * launch runs through the top channel and a fast one crosses all three. */
  onFuel(i) {
    this.lamp(`fuel${i}`, 0.6);
    if (this.fuel[i]) {
      this.add(PTS.fuel);
      return;
    }
    this.fuel[i] = true;
    this.add(PTS.fuel);
    sfx.target(i);
    if (!this.fuel.every(Boolean)) return;
    this.fuel = [false, false, false];
    this.add(PTS.fuelBank);
    if (this.bonusX < 5) {
      this.bonusX++;
      this.say(`BONUS X${this.bonusX}`, 1.8);
      sfx.bankClear();
    } else {
      this.say('FUEL FULL', 1.4);
      sfx.bankClear();
    }
  }

  armMission() {
    // Cycle through them so a game shows the player all four.
    const next = MISSIONS[this.missionsDone % MISSIONS.length];
    this.mission = next;
    this.missionProgress = 0;
    this.say(next.name, 2.2);
    this.emit('mission', next);
    sfx.missionStart();
  }

  progress() {
    if (!this.mission) return;
    this.missionProgress++;
    if (this.missionProgress < this.mission.goal) return;

    const award = PTS.mission * (this.rankIdx + 1);
    this.add(award);
    this.missionsDone++;
    this.say('MISSION COMPLETE', 2.4);
    this.pop(TABLE_W / 2, 470, `${award}`, C.green, 1.4);
    sfx.missionDone();
    this.mission = null;
    this.emit('mission', null);
    this.flash(0.4);

    if (this.rankIdx < RANKS.length - 1) {
      this.rankIdx++;
      this.add(PTS.rank);
      setTimeout(() => {
        if (this.state !== 'playing') return;
        this.say(`PROMOTED — ${this.rank.toUpperCase()}`, 2.6);
        sfx.rankUp();
        this.emit('rank', this.rankIdx);
      }, 1500);
    }

    // Multiball once you are a real officer, and an extra ball on the way up.
    if (this.rankIdx >= 3 && !this.multiball && this.balls.length === 1) {
      setTimeout(() => this.startMultiball(), 2600);
    }
    if (this.rankIdx >= 2 && !this.extraBallAwarded) {
      this.extraBallAwarded = true;
      this.ballsLeft++;
      setTimeout(() => {
        if (this.state === 'playing') this.say('EXTRA BALL', 2);
      }, 3200);
    }
  }

  startMultiball() {
    if (this.state !== 'playing' || this.balls.length !== 1) return;
    this.multiball = true;
    const s = this.table.ballStart;
    this.balls.push(makeBall(s.x, s.y - 30, -120, -1500));
    this.say('MULTIBALL', 2.4);
    sfx.multiball();
    this.flash(0.5);
  }

  onDrain() {
    sfx.drain();
    if (this.balls.length > 0) {
      // Multiball: losing one is not losing the ball.
      this.say('BALL SAVED — KEEP GOING', 1.4);
      return;
    }
    this.multiball = false;
    this.ballsLeft--;
    if (this.ballsLeft <= 0) {
      this.state = 'over';
      sfx.gameover();
      this.emit('gameover', {
        score: this.score,
        rankIdx: this.rankIdx,
        rank: this.rank,
        missions: this.missionsDone,
      });
      return;
    }
    this.ballNo++;
    this.resetTable();
    this.newBall();
    this.say(`BALL ${this.ballNo}`, 1.6);
    this.emit('hud');
  }

  add(n) {
    this.score += Math.round(n * this.bonusX);
  }

  /* ----------------------------------------------------------------- input -- */

  flip(side, down) {
    if (this.state !== 'playing' || this.tilted) return;
    const f = this.table.flippers[side === 'L' ? 0 : 1];
    if (down && !f.up) sfx.flip();
    f.up = down;
  }

  plungeHold(on) {
    if (this.state !== 'playing') return;
    if (on) {
      this.plungerHeld = true;
      return;
    }
    this.plungerHeld = false;
    if (!this.inLane) return;
    const power = clamp(this.plunger, 0.18, 1);
    const b = this.balls[0];
    if (!b) return;
    this.inLane = false;
    /* The floor here matters. Clearing the lane's inner wall needs ~1470 units/s;
     * at the old base of 760 anything under about half charge could not reach the
     * playfield at all and simply rolled back down for a re-plunge. Measured, 57%
     * of launches never entered play — which is precisely the "ball falls to the
     * right without me playing" complaint. Every launch now clears; power decides
     * how far round the dome it carries, which is what a plunger should control. */
    b.vy = -(1700 + 900 * power);
    b.vx = -10;
    sfx.plunge(power);
    this.plunger = 0;
  }

  /** Shove the table. Bank too many and it tilts, which is the whole point. */
  nudge(dx) {
    if (this.state !== 'playing' || this.tilted) return;
    this.nudgeX += dx * 520;
    this.nudgeY -= 190;
    this.nudgeBank += 1;
    this.shake = this.reduceMotion ? 0 : 7;
    sfx.nudge();
    if (this.nudgeBank > TILT_LIMIT) {
      this.tilted = true;
      this.say('TILT', 2.4);
      sfx.tilt();
      this.emit('tilt');
    } else if (this.nudgeBank > TILT_LIMIT - 1.2) {
      this.tiltWarn = 1.2;
    }
  }

  /* --------------------------------------------------------------- visuals -- */

  updateVisuals(dt) {
    if (this.state === 'playing' && this.plungerHeld && this.inLane) {
      this.plunger = Math.min(1, this.plunger + dt * 1.5);
    }
    this.shake *= Math.pow(0.004, dt);
    this.messageT = Math.max(0, this.messageT - dt);
    for (const k in this.lampT) this.lampT[k] = Math.max(0, this.lampT[k] - dt);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 26 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i] -= dt * 2.4;
      if (this.flashes[i] <= 0) this.flashes.splice(i, 1);
    }
  }

  lamp(key, t) {
    this.lampT[key] = Math.max(this.lampT[key] || 0, t);
  }

  say(text, t = 1.6) {
    this.message = text;
    this.messageT = t;
    this.emit('say', text);
  }

  flash(v) {
    if (!this.reduceMotion) this.flashes.push(v);
  }

  pop(x, y, text, color, size = 1) {
    if (this.popups.length > 12) this.popups.shift();
    this.popups.push({ x, y, text, color, size, life: 1, max: 1 });
  }

  burst(x, y, color, n) {
    if (this.reduceMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(340, 90);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.45, 0.2),
        max: 0.45,
        size: rand(6, 3),
        color,
      });
    }
  }

  /* ---------------------------------------------------------------- render --
   * Two layers. Everything that never changes — felt, starfield, line art,
   * decals, rails — is baked once into an offscreen canvas at the current pixel
   * density and blitted with a single drawImage. Only the parts that actually
   * animate are drawn per frame. That is what pays for artwork this dense: the
   * bake is a few hundred operations run once per resize instead of once per
   * frame at 120 Hz.
   */

  /** Rebuild the static layer. Called from resize(), never from the loop. */
  bakeArt() {
    const px = clamp(this.scale * clamp(window.devicePixelRatio || 1, 1, 2), 0.4, 3);
    const cv = this._art || (this._art = document.createElement('canvas'));
    cv.width = Math.max(1, Math.round(TABLE_W * px));
    cv.height = Math.max(1, Math.round(TABLE_H * px));
    const g = cv.getContext('2d');
    g.setTransform(px, 0, 0, px, 0, 0);
    g.clearRect(0, 0, TABLE_W, TABLE_H);

    this.bakeFelt(g);
    this.bakeRings(g);
    this.bakePanels(g);
    this.bakeLanes(g);
    this.bakeArrows(g);
    this.bakeApron(g);
    this.bakeLabels(g);
    /* Everything above is printed on the playfield, so it must stop at the
     * playfield's edge. Painting the outside AFTER the decals, rather than
     * clipping each one, keeps every draw call above free of geometry it should
     * not have to know about. The rails go on top, since a rail straddles the
     * edge by design. */
    this.maskOutside(g);
    this.bakeRails(g);
    this._artPx = px;
  }

  /** Paint over everything outside the table, so the felt has the table's shape. */
  maskOutside(g) {
    g.beginPath();
    g.rect(0, 0, TABLE_W, TABLE_H);
    g.moveTo(BOUNDARY[0][0], BOUNDARY[0][1]);
    for (const p of BOUNDARY.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, TABLE_H);
    grad.addColorStop(0, '#0a1024');
    grad.addColorStop(1, '#05080f');
    g.fillStyle = grad;
    g.fill('evenodd');
  }

  bakeFelt(g) {
    const grad = g.createRadialGradient(TABLE_W / 2, 330, 40, TABLE_W / 2, 580, 780);
    grad.addColorStop(0, C.feltLit);
    grad.addColorStop(0.55, C.felt);
    grad.addColorStop(1, C.deep);
    g.fillStyle = grad;
    g.fillRect(0, 0, TABLE_W, TABLE_H);

    /* A starfield, because the table is called Orbit Cadet and the original's
     * playfield is space. Deterministic: the same stars every load, so it reads
     * as printed artwork rather than noise. */
    let seed = 20260730;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 320; i++) {
      const x = rnd() * TABLE_W;
      const y = rnd() * TABLE_H;
      const r = 0.4 + rnd() * 1.5;
      const a = 0.1 + rnd() * 0.55;
      g.globalAlpha = a;
      g.fillStyle = rnd() > 0.86 ? C.line : '#ffffff';
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    // A nebula wash behind the bumper cluster.
    const neb = g.createRadialGradient(280, 414, 10, 280, 414, 210);
    neb.addColorStop(0, 'rgba(80,150,255,0.16)');
    neb.addColorStop(0.6, 'rgba(123,92,255,0.07)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = neb;
    g.fillRect(70, 204, 420, 420);
  }

  bakeRings(g) {
    const rings = this.table.decor.rings;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      g.strokeStyle = i === rings.length - 1 ? 'rgba(127,201,255,0.55)' : 'rgba(127,201,255,0.28)';
      g.lineWidth = i === rings.length - 1 ? 2.5 : 1.5;
      g.setLineDash(i % 2 ? [10, 8] : []);
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, TAU);
      g.stroke();
    }
    g.setLineDash([]);
    // Tick marks round the outermost ring, like a range scale.
    const outer = rings[0];
    g.strokeStyle = 'rgba(127,201,255,0.34)';
    g.lineWidth = 2;
    for (let a = 0; a < TAU; a += TAU / 24) {
      g.beginPath();
      g.moveTo(outer.x + Math.cos(a) * (outer.r - 7), outer.y + Math.sin(a) * (outer.r - 7));
      g.lineTo(outer.x + Math.cos(a) * outer.r, outer.y + Math.sin(a) * outer.r);
      g.stroke();
    }
  }

  bakePanels(g) {
    for (const p of this.table.decor.panels) {
      g.beginPath();
      g.moveTo(p.pts[0][0], p.pts[0][1]);
      for (const q of p.pts.slice(1)) g.lineTo(q[0], q[1]);
      g.closePath();
      g.fillStyle = 'rgba(12,23,64,0.5)';
      g.fill();
      g.strokeStyle = p.color;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  /** Lane floors: a lighter channel with a hairline either side. */
  bakeLanes(g) {
    for (const lane of this.table.decor.lanes) {
      const trace = () => {
        g.beginPath();
        g.moveTo(lane.path[0][0], lane.path[0][1]);
        for (const p of lane.path.slice(1)) g.lineTo(p[0], p[1]);
      };
      g.lineCap = 'round';
      g.lineJoin = 'round';
      trace();
      g.strokeStyle = 'rgba(127,201,255,0.09)';
      g.lineWidth = lane.w;
      g.stroke();
      trace();
      g.strokeStyle = 'rgba(127,201,255,0.16)';
      g.lineWidth = lane.w - 5;
      g.stroke();
      trace();
      g.strokeStyle = 'rgba(12,23,64,0.55)';
      g.lineWidth = lane.w - 11;
      g.stroke();
    }
  }

  bakeArrows(g) {
    for (const a of this.table.decor.arrows) {
      g.save();
      g.translate(a.x, a.y);
      g.rotate(a.rot);
      g.strokeStyle = 'rgba(127,201,255,0.5)';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (let i = 0; i < a.n; i++) {
        const d = i * 15;
        g.beginPath();
        g.moveTo(d - 10, 11);
        g.lineTo(d, 0);
        g.lineTo(d + 10, 11);
        g.stroke();
      }
      g.restore();
    }
  }

  bakeLabels(g) {
    for (const l of this.table.decor.labels) {
      g.save();
      g.translate(l.x, l.y);
      if (l.rot) g.rotate(l.rot);
      g.fillStyle = l.color;
      g.font = `700 ${l.size}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      tracked(g, l.text, 0, 0, l.track || 0);
      g.restore();
    }
    g.textBaseline = 'alphabetic';
  }

  /** The rails: chrome, which is three strokes — shadow, body, highlight. */
  bakeRails(g) {
    for (const o of this.table.solids) {
      if (o.kind !== 'seg' || o.target !== undefined || o.sling) continue;
      const wide = o.surf === 'metal' ? 9 : 10;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(3,6,20,0.75)';
      g.lineWidth = wide + 4;
      line(g, o.x1, o.y1 + 3, o.x2, o.y2 + 3);
      const grad = g.createLinearGradient(o.x1, o.y1 - wide, o.x1, o.y1 + wide);
      grad.addColorStop(0, o.surf === 'metal' ? C.chrome : '#5b6b91');
      grad.addColorStop(0.5, o.surf === 'metal' ? C.chromeMid : '#3b4770');
      grad.addColorStop(1, C.chromeDark);
      g.strokeStyle = grad;
      g.lineWidth = wide;
      line(g, o.x1, o.y1, o.x2, o.y2);
      g.strokeStyle = 'rgba(255,255,255,0.42)';
      g.lineWidth = 2;
      line(g, o.x1, o.y1 - wide * 0.3, o.x2, o.y2 - wide * 0.3);
    }
    // Solid posts are static too.
    for (const o of this.table.solids) {
      if (o.kind !== 'circle' || o.bumper !== undefined) continue;
      const grad = g.createRadialGradient(o.cx - o.r * 0.35, o.cy - o.r * 0.45, 1, o.cx, o.cy, o.r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, C.chrome);
      grad.addColorStop(1, C.chromeDark);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(o.cx, o.cy, o.r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(3,6,20,0.8)';
      g.lineWidth = 2;
      g.stroke();
    }
  }

  /** The dead wedge beside the plunger lane, and the drain mouth's decal.
   *
   * There is no apron on the left: the left funnel wall runs straight from the
   * flipper to the drain lip, so outside it is outside the table. The right side
   * has a real sealed wedge between the funnel and the lane, and left as felt it
   * read as playfield the ball was mysteriously never in. */
  bakeApron(g) {
    const wedge = [[400, 874], [328, 1000], [498, 1000], [498, 770], [450, 856]];
    g.beginPath();
    g.moveTo(wedge[0][0], wedge[0][1]);
    for (const p of wedge.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath();
    const grad = g.createLinearGradient(0, 770, 0, 1000);
    grad.addColorStop(0, '#111a38');
    grad.addColorStop(1, '#070c1e');
    g.fillStyle = grad;
    g.fill();

    g.fillStyle = 'rgba(255,82,64,0.85)';
    g.font = '700 12px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
    g.textAlign = 'center';
    tracked(g, 'DRAIN', TABLE_W / 2, 964, 4);
    // Two chevrons pointing into the mouth, so it reads as the way out.
    g.strokeStyle = 'rgba(255,82,64,0.45)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const y = 976 + i * 12;
      g.beginPath();
      g.moveTo(TABLE_W / 2 - 12, y);
      g.lineTo(TABLE_W / 2, y + 8);
      g.lineTo(TABLE_W / 2 + 12, y);
      g.stroke();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = C.deep;
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.wide) this.drawBackglass(ctx);

    ctx.save();
    if (this.shake > 0.3) ctx.translate(rand(this.shake, -this.shake), rand(this.shake, -this.shake) * 0.5);
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    if (this._art) ctx.drawImage(this._art, 0, 0, TABLE_W, TABLE_H);

    this.drawInserts(ctx);
    this.drawTargets(ctx);
    this.drawSlings(ctx);
    this.drawBumpers(ctx);
    this.drawFlippers(ctx);
    this.drawPlunger(ctx);
    this.drawBalls(ctx);
    this.drawParticles(ctx);
    this.drawPopups(ctx);
    this.drawMessage(ctx);

    ctx.restore();

    let f = 0;
    for (const v of this.flashes) f = Math.max(f, v);
    if (f > 0) {
      ctx.globalAlpha = Math.min(0.7, f);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(5,9,29,0.6)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /* --- inserts: the lit lamps flush in the playfield --- */

  drawInserts(ctx) {
    for (const l of this.table.lamps) {
      if (l.kind === 'bumper') continue; // drawn with the bumper body
      const on = this.lampOn(l);
      const col = l.kind === 'fuel' ? C.amber : l.kind === 'selector' ? C.green : C.line;
      insert(ctx, l.x, l.y, l.r, on ? col : C.lampOff, on);
      if (l.kind === 'spinner') {
        // Leans with its recent activity, so it reads as a spinner.
        const t = clamp(this.lampT.spinner || 0, 0, 1);
        const lean = Math.sin(this.time * 15) * t;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.strokeStyle = C.chrome;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-l.r, -l.r * 0.85);
        ctx.lineTo(-l.r, l.r * 0.85);
        ctx.moveTo(l.r, -l.r * 0.85);
        ctx.lineTo(l.r, l.r * 0.85);
        ctx.stroke();
        ctx.scale(1, 0.25 + Math.abs(lean) * 0.75);
        const gr = ctx.createLinearGradient(0, -l.r, 0, l.r);
        gr.addColorStop(0, t > 0 ? '#ffffff' : '#6f7fa6');
        gr.addColorStop(1, t > 0 ? C.line : '#39456d');
        ctx.fillStyle = gr;
        ctx.fillRect(-l.r * 0.85, -l.r * 0.85, l.r * 1.7, l.r * 1.7);
        ctx.restore();
      }
    }

    // The two bar inserts: bonus multiplier and rank ladder.
    for (const b of this.table.decor.bars) {
      const n = b.kind === 'bonus' ? 5 : RANKS.length;
      const lit = b.kind === 'bonus' ? this.bonusX : this.rankIdx + 1;
      const cw = b.w / n;
      for (let i = 0; i < n; i++) {
        const on = i < lit;
        ctx.fillStyle = on ? (b.kind === 'bonus' ? C.amber : C.green) : C.lampOff;
        ctx.globalAlpha = on ? 0.95 : 0.6;
        ctx.fillRect(b.x + i * cw + 1.5, b.y, cw - 3, b.h);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(127,201,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // Shot rings, so the orbit and mission targets read as things to aim at.
    for (const s of this.table.sensors) {
      if (!s.label) continue;
      const armed = s.id === 'selector' ? !this.mission : true;
      ctx.strokeStyle = armed ? 'rgba(78,240,160,0.55)' : 'rgba(143,163,204,0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  lampOn(l) {
    if (l.kind === 'fuel') return this.fuel[l.i] || (this.lampT[`fuel${l.i}`] || 0) > 0;
    if (l.kind === 'selector') return !this.mission || (this.lampT.selector || 0) > 0;
    if (l.kind === 'target') return !this.table.targets[l.i].off;
    if (l.kind === 'sling') return (this.lampT[`sling${l.side}`] || 0) > 0;
    if (l.kind === 'inlane') return (this.lampT[`inlane${l.side}`] || 0) > 0;
    return (this.lampT[l.kind] || 0) > 0;
  }

  drawTargets(ctx) {
    for (const o of this.table.targets) {
      const nx = o.y2 - o.y1;
      const ny = -(o.x2 - o.x1);
      const len = Math.hypot(nx, ny) || 1;
      if (o.off) {
        ctx.strokeStyle = 'rgba(127,201,255,0.16)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 5]);
        line(ctx, o.x1, o.y1, o.x2, o.y2);
        ctx.setLineDash([]);
        continue;
      }
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(3,6,20,0.8)';
      ctx.lineWidth = 15;
      line(ctx, o.x1, o.y1, o.x2, o.y2);
      const gr = ctx.createLinearGradient(
        o.x1 - (nx / len) * 7, o.y1 - (ny / len) * 7,
        o.x1 + (nx / len) * 7, o.y1 + (ny / len) * 7
      );
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, C.line);
      gr.addColorStop(1, '#2a63a8');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 11;
      line(ctx, o.x1, o.y1, o.x2, o.y2);
      ctx.lineCap = 'round';
    }
  }

  /* The plate each kicker's rubber is stretched over, then the rubber itself. */
  drawSlings(ctx) {
    for (const pts of this.table.slingPlates || []) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      const gr = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      gr.addColorStop(0, '#26325c');
      gr.addColorStop(1, '#121a38');
      ctx.fillStyle = gr;
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,6,20,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const o of this.table.solids) {
      if (!o.sling) continue;
      const lit = (this.lampT[`sling${o.sling}`] || 0) > 0;
      /* Only the long face carries rubber. Drawing all three edges of the
       * triangle in flipper red made each kicker read as an enormous red arrow
       * halfway up the table; the other two edges are just the plate's rim. */
      ctx.lineCap = 'round';
      if (!o.kick) {
        ctx.strokeStyle = C.chromeDark;
        ctx.lineWidth = 4;
        line(ctx, o.x1, o.y1, o.x2, o.y2);
        continue;
      }
      ctx.strokeStyle = lit ? '#ffe0d2' : C.rubber;
      ctx.lineWidth = 8;
      line(ctx, o.x1, o.y1, o.x2, o.y2);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      line(ctx, o.x1, o.y1 - 2, o.x2, o.y2 - 2);
    }
  }

  drawBumpers(ctx) {
    for (const l of this.table.lamps) {
      if (l.kind !== 'bumper') continue;
      const t = clamp(this.lampT[`bumper${l.i}`] || 0, 0, 1);
      // Skirt.
      ctx.fillStyle = 'rgba(3,6,20,0.55)';
      ctx.beginPath();
      ctx.arc(l.x, l.y + 5, l.r + 4, 0, TAU);
      ctx.fill();
      const ring = ctx.createRadialGradient(l.x, l.y, l.r * 0.6, l.x, l.y, l.r);
      ring.addColorStop(0, C.chromeDark);
      ring.addColorStop(0.7, C.chromeMid);
      ring.addColorStop(1, C.chrome);
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fill();
      // Cap.
      const hue = BUMPER_CAP[l.i % BUMPER_CAP.length];
      const cap = ctx.createRadialGradient(l.x - l.r * 0.3, l.y - l.r * 0.35, 2, l.x, l.y, l.r * 0.74);
      cap.addColorStop(0, t > 0 ? '#ffffff' : hue[0]);
      cap.addColorStop(1, t > 0 ? C.amber : hue[1]);
      ctx.fillStyle = cap;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r * 0.74, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(3,6,20,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = t > 0 ? '#ffffff' : '#93a4cc';
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r * 0.26, 0, TAU);
      ctx.fill();
      if (t > 0) {
        ctx.globalAlpha = t * 0.45;
        ctx.fillStyle = C.amber;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r * (1.4 + t), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawFlippers(ctx) {
    for (const f of this.table.flippers) {
      const tip = f.tip();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(3,6,20,0.6)';
      ctx.lineWidth = (f.radius + 3) * 2;
      line(ctx, f.x, f.y + 5, tip.x, tip.y + 5);

      const g = ctx.createLinearGradient(f.x, f.y - f.radius, f.x, f.y + f.radius);
      g.addColorStop(0, '#ff9c84');
      g.addColorStop(0.45, C.red);
      g.addColorStop(1, '#9c2317');
      ctx.strokeStyle = g;
      ctx.lineWidth = f.radius * 2;
      line(ctx, f.x, f.y, tip.x, tip.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2.5;
      line(ctx, f.x, f.y - f.radius * 0.42, tip.x, tip.y - f.radius * 0.42);

      const hub = ctx.createRadialGradient(f.x - 2, f.y - 2, 1, f.x, f.y, 6);
      hub.addColorStop(0, '#ffffff');
      hub.addColorStop(1, C.chromeMid);
      ctx.fillStyle = hub;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5.5, 0, TAU);
      ctx.fill();
    }
  }

  drawPlunger(ctx) {
    const p = this.table.plungerLane;
    const y = p.y + 34 - this.plunger * 26;
    ctx.strokeStyle = C.chromeMid;
    ctx.lineWidth = 7;
    line(ctx, 519, y + 30, 519, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    line(ctx, 517, y + 30, 517, y);
    const knob = ctx.createRadialGradient(515, y - 3, 1, 519, y, 11);
    knob.addColorStop(0, this.inLane ? '#ffe6b0' : '#a9b6d4');
    knob.addColorStop(1, this.inLane ? C.amber : C.chromeDark);
    ctx.fillStyle = knob;
    ctx.beginPath();
    ctx.arc(519, y, 11, 0, TAU);
    ctx.fill();
    if (this.inLane && this.plunger > 0.02) {
      ctx.fillStyle = C.green;
      ctx.fillRect(535, 900 - this.plunger * 120, 5, this.plunger * 120);
    }
  }

  drawBalls(ctx) {
    for (const b of this.balls) {
      ctx.fillStyle = 'rgba(3,6,20,0.5)';
      ctx.beginPath();
      ctx.ellipse(b.x + 3, b.y + 6, b.r, b.r * 0.8, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.42, C.ball);
      g.addColorStop(1, '#5d6a92');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      // The bright pinprick that makes chrome look like chrome.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.34, b.y - b.r * 0.4, b.r * 0.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 0.5, 0.6, 2.2);
      ctx.stroke();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawPopups(ctx) {
    ctx.textAlign = 'center';
    for (const p of this.popups) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.font = `700 ${Math.round(22 * p.size)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(3,6,20,0.7)';
      ctx.fillText(p.text, p.x + 2, p.y + 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  drawMessage(ctx) {
    if (this.messageT <= 0 || !this.message) return;
    const a = clamp(this.messageT * 1.6, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(5,9,29,0.86)';
    ctx.fillRect(40, 542, TABLE_W - 80, 46);
    ctx.strokeStyle = 'rgba(127,201,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 542, TABLE_W - 80, 46);
    ctx.font = '700 24px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = this.tilted ? C.red : C.amber;
    tracked(ctx, this.message, TABLE_W / 2, 573, 2);
    ctx.globalAlpha = 1;
  }

  /* A backglass in the margins, which is where a real cabinet puts the score. On
   * a phone there is no room and the DOM HUD carries it instead. */
  drawBackglass(ctx) {
    const w = this.offX - 14;
    if (w < 60) return;
    const boxes = [
      { x: 7, label: 'SCORE', value: this.score.toLocaleString('en-US') },
      { x: this.w - w - 7, label: 'RANK', value: this.rank.toUpperCase() },
    ];
    for (const b of boxes) {
      ctx.fillStyle = '#0b1230';
      ctx.fillRect(b.x, this.offY, w, 118);
      ctx.strokeStyle = 'rgba(127,201,255,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, this.offY + 1, w - 2, 116);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.dim;
      ctx.font = '700 11px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
      tracked(ctx, b.label, b.x + w / 2, this.offY + 26, 3);
      ctx.fillStyle = C.amber;
      ctx.font = `700 ${clamp(Math.floor(w / 6), 12, 26)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
      ctx.fillText(b.value, b.x + w / 2, this.offY + 62);
    }

    // Mission panel under the left box.
    if (this.mission) {
      const x = 7;
      ctx.fillStyle = '#0b1230';
      ctx.fillRect(x, this.offY + 128, w, 96);
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, this.offY + 129, w - 2, 94);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.green;
      ctx.font = '700 11px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
      tracked(ctx, 'MISSION', x + w / 2, this.offY + 152, 3);
      ctx.fillStyle = C.ink;
      ctx.font = '700 13px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(`${this.missionProgress}/${this.mission.goal}`, x + w / 2, this.offY + 196);
      ctx.fillStyle = C.dim;
      ctx.font = '600 10px ui-rounded, "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(this.mission.name.slice(0, 14), x + w / 2, this.offY + 174);
    }
  }
}

/* --- small drawing helpers ------------------------------------------------ */

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** Centred text with letter spacing, which canvas has no property for and which
 *  is most of what makes a playfield decal look printed rather than typed. */
function tracked(g, text, x, y, track) {
  if (!track) {
    g.fillText(text, x, y);
    return;
  }
  const widths = [...text].map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (text.length - 1);
  const prev = g.textAlign;
  g.textAlign = 'left';
  let cx = prev === 'left' ? x : x - total / 2;
  for (let i = 0; i < text.length; i++) {
    g.fillText(text[i], cx, y);
    cx += widths[i] + track;
  }
  g.textAlign = prev;
}

/** A playfield insert: a lens flush in the wood, dark when off, glowing when on. */
function insert(g, x, y, r, colour, on) {
  g.fillStyle = 'rgba(3,6,20,0.55)';
  g.beginPath();
  g.arc(x, y + 1.5, r + 2, 0, TAU);
  g.fill();
  g.fillStyle = colour;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  if (on) {
    g.globalAlpha = 0.3;
    g.beginPath();
    g.arc(x, y, r * 2.1, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(x - r * 0.3, y - r * 0.35, r * 0.34, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(127,201,255,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.stroke();
}

export { MISSIONS, RANKS, SURF, lerp };
