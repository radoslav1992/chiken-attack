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
import { buildTable, RANKS, TABLE_W, TABLE_H } from './table.js';
import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);

const C = {
  ink: '#f6efe3',
  dim: '#9a92b8',
  amber: '#ffb43d',
  red: '#ff5240',
  teal: '#43e0c0',
  purple: '#7b5cff',
  felt: '#171432',
  feltLit: '#221d45',
  rail: '#3b3560',
  metal: '#8f88ad',
  metalLit: '#c9c2e0',
  rubber: '#ff5240',
  ball: '#dfe3f2',
  lampOff: '#2b2646',
};

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
    this._grad = null;
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
  }

  newBall() {
    const s = this.table.ballStart;
    this.balls = [makeBall(s.x, s.y, 0, 0)];
    this.plunger = 0;
    this.inLane = true;
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

      // Back down the plunger lane is a re-launch, not a loss.
      if (b.x > table.laneX0 && b.y > 930 && Math.abs(b.vy) < 220 && this.balls.length === 1) {
        this.inLane = true;
        this.plunger = 0;
      }

      if (b.y > table.drainY) {
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
      this.pop(o.x1 + 20, o.y1 + 12, `${PTS.target}`, C.teal);
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
        break;
      default:
        break;
    }
    void b;
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
    this.pop(TABLE_W / 2, 560, `${award}`, C.teal, 1.4);
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
    this.score += n;
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
    b.vy = -(760 + 1500 * power);
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

  /* ---------------------------------------------------------------- render -- */

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0913';
    ctx.fillRect(0, 0, this.w, this.h);

    if (this.wide) this.drawBackglass(ctx);

    ctx.save();
    if (this.shake > 0.3) ctx.translate(rand(this.shake, -this.shake), rand(this.shake, -this.shake) * 0.5);
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    this.drawPlayfield(ctx);
    this.drawLanes(ctx);
    this.drawSlings(ctx);
    this.drawSolids(ctx);
    this.drawLamps(ctx);
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
      ctx.fillStyle = 'rgba(11,9,19,0.6)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  drawPlayfield(ctx) {
    if (!this._grad) {
      const g = ctx.createRadialGradient(TABLE_W / 2, 380, 60, TABLE_W / 2, 500, 720);
      g.addColorStop(0, C.feltLit);
      g.addColorStop(1, C.felt);
      this._grad = g;
    }
    ctx.fillStyle = this._grad;
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);

    // Faint concentric arcs, the sort of decal a real playfield carries.
    ctx.strokeStyle = 'rgba(123,92,255,0.10)';
    ctx.lineWidth = 2;
    for (let r = 120; r < 620; r += 70) {
      ctx.beginPath();
      ctx.arc(TABLE_W / 2, 300, r, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
    // Mission name across the middle of the playfield, as table art.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(67,224,192,0.25)';
    ctx.font = '700 34px ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORBIT CADET', TABLE_W / 2, 700);
    ctx.restore();
  }

  /** The lane floors, drawn as slightly lighter channels so the shots read. */
  drawLanes(ctx) {
    ctx.strokeStyle = 'rgba(246,239,227,0.05)';
    ctx.lineWidth = 44;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(48, 640);
    ctx.quadraticCurveTo(52, 380, 120, 240);
    ctx.quadraticCurveTo(180, 150, 268, 130);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(519, 900);
    ctx.lineTo(519, 320);
    ctx.stroke();
  }

  /* The triangular plate each slingshot's rubber is stretched over. Drawn
   * first, so the rubber sits on top of it. */
  drawSlings(ctx) {
    for (const pts of this.table.slingPlates || []) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fillStyle = '#2a2450';
      ctx.fill();
      ctx.strokeStyle = 'rgba(11,9,19,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  drawSolids(ctx) {
    for (const o of this.table.solids) {
      if (o.off) {
        // A dropped target leaves its slot visible.
        if (o.target !== undefined) {
          ctx.strokeStyle = 'rgba(246,239,227,0.12)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(o.x1, o.y1);
          ctx.lineTo(o.x2, o.y2);
          ctx.stroke();
        }
        continue;
      }
      if (o.kind === 'circle') {
        if (o.bumper !== undefined) continue; // drawn with the lamps
        const g = ctx.createRadialGradient(o.cx - o.r * 0.3, o.cy - o.r * 0.4, 1, o.cx, o.cy, o.r);
        g.addColorStop(0, C.metalLit);
        g.addColorStop(1, C.rail);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.cx, o.cy, o.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(11,9,19,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        continue;
      }
      if (o.kind !== 'seg') continue;

      const isTarget = o.target !== undefined;
      const surf = o.surf;
      ctx.lineCap = 'round';
      if (isTarget) {
        const lit = (this.lampT[`target${o.target}`] || 0) > 0;
        ctx.strokeStyle = lit ? C.ink : C.teal;
        ctx.lineWidth = 12;
      } else if (surf === 'rubber') {
        // Thinner than a flipper, and a lighter red: at flipper weight in
        // flipper red these read as two extra flippers halfway up the table.
        const lit = (this.lampT[o.sling === 'L' ? 'slingL' : 'slingR'] || 0) > 0;
        ctx.strokeStyle = lit ? '#ffd9c4' : '#c9483a';
        ctx.lineWidth = 7;
      } else if (surf === 'metal') {
        ctx.strokeStyle = C.metal;
        ctx.lineWidth = 9;
      } else {
        ctx.strokeStyle = C.rail;
        ctx.lineWidth = 10;
      }
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      // A thin highlight along the top of each rail.
      ctx.strokeStyle = 'rgba(246,239,227,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1 - 3);
      ctx.lineTo(o.x2, o.y2 - 3);
      ctx.stroke();
    }
  }

  drawLamps(ctx) {
    for (const l of this.table.lamps) {
      const key = l.kind === 'bumper' ? `bumper${l.i}` : l.kind === 'target' ? `target${l.i}` : l.kind === 'sling' ? 'slingL' : l.kind;
      const t = clamp(this.lampT[key] || 0, 0, 1);

      if (l.kind === 'bumper') {
        // A pop bumper: skirt, body, and a cap that flares when it fires.
        ctx.fillStyle = 'rgba(11,9,19,0.5)';
        ctx.beginPath();
        ctx.arc(l.x, l.y + 4, l.r + 3, 0, TAU);
        ctx.fill();
        const g = ctx.createRadialGradient(l.x - l.r * 0.3, l.y - l.r * 0.4, 2, l.x, l.y, l.r);
        g.addColorStop(0, t > 0 ? '#fff6e2' : '#6b5f9c');
        g.addColorStop(1, t > 0 ? C.amber : '#3b3560');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = t > 0 ? C.ink : C.rail;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = t > 0 ? C.ink : '#8d85ab';
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r * 0.34, 0, TAU);
        ctx.fill();
        if (t > 0) {
          ctx.globalAlpha = t * 0.5;
          ctx.fillStyle = C.amber;
          ctx.beginPath();
          ctx.arc(l.x, l.y, l.r * (1.5 + t), 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        continue;
      }

      if (l.kind === 'spinner') {
        // Reads as a spinner by leaning with its recent activity.
        const spin = Math.sin(this.time * 14) * t;
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.strokeStyle = C.metal;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-l.r, -l.r * 0.8);
        ctx.lineTo(-l.r, l.r * 0.8);
        ctx.moveTo(l.r, -l.r * 0.8);
        ctx.lineTo(l.r, l.r * 0.8);
        ctx.stroke();
        ctx.scale(1, 0.3 + Math.abs(spin) * 0.7);
        ctx.fillStyle = t > 0 ? C.teal : '#4a4470';
        ctx.fillRect(-l.r * 0.9, -l.r * 0.9, l.r * 1.8, l.r * 1.8);
        ctx.restore();
        continue;
      }

      // Generic round insert lamp.
      const on = t > 0 || (l.kind === 'selector' && !this.mission);
      ctx.fillStyle = on ? C.teal : C.lampOff;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(11,9,19,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (on) {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r * 2.1, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Sensor rings, so the orbit and mission shots are visible targets.
    for (const s of this.table.sensors) {
      if (!s.label) continue;
      const armed = s.id === 'selector' ? !this.mission : true;
      ctx.strokeStyle = armed ? 'rgba(67,224,192,0.5)' : 'rgba(154,146,184,0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = armed ? 'rgba(67,224,192,0.75)' : 'rgba(154,146,184,0.4)';
      ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, s.x, s.y + s.r + 16);
    }
  }

  drawFlippers(ctx) {
    for (const f of this.table.flippers) {
      const tip = f.tip();
      ctx.strokeStyle = 'rgba(11,9,19,0.55)';
      ctx.lineWidth = (f.radius + 3) * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + 5);
      ctx.lineTo(tip.x, tip.y + 5);
      ctx.stroke();

      const g = ctx.createLinearGradient(f.x, f.y - f.radius, f.x, f.y + f.radius);
      g.addColorStop(0, '#ff8a70');
      g.addColorStop(0.5, C.red);
      g.addColorStop(1, '#b32a1c');
      ctx.strokeStyle = g;
      ctx.lineWidth = f.radius * 2;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      ctx.fillStyle = C.metalLit;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 5, 0, TAU);
      ctx.fill();
    }
  }

  drawPlunger(ctx) {
    const p = this.table.plungerLane;
    const y = p.y + 34 - this.plunger * 26;
    ctx.strokeStyle = C.metal;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(519, y + 26);
    ctx.lineTo(519, y);
    ctx.stroke();
    ctx.fillStyle = this.inLane ? C.amber : C.rail;
    ctx.beginPath();
    ctx.arc(519, y, 11, 0, TAU);
    ctx.fill();
    if (this.inLane && this.plunger > 0.02) {
      ctx.fillStyle = C.teal;
      ctx.fillRect(536, 900 - this.plunger * 120, 5, this.plunger * 120);
    }
  }

  drawBalls(ctx) {
    for (const b of this.balls) {
      ctx.fillStyle = 'rgba(11,9,19,0.5)';
      ctx.beginPath();
      ctx.ellipse(b.x + 3, b.y + 6, b.r, b.r * 0.8, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, C.ball);
      g.addColorStop(1, '#6f7594');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.22, 0, TAU);
      ctx.fill();
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
      ctx.font = `700 ${Math.round(22 * p.size)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(11,9,19,0.7)';
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
    ctx.font = '700 30px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(11,9,19,0.75)';
    ctx.fillRect(30, 540, TABLE_W - 60, 52);
    ctx.fillStyle = this.tilted ? C.red : C.amber;
    ctx.fillText(this.message, TABLE_W / 2, 576);
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
      ctx.fillStyle = '#141130';
      ctx.fillRect(b.x, this.offY, w, 118);
      ctx.strokeStyle = C.rail;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, this.offY + 1, w - 2, 116);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.dim;
      ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
      ctx.fillText(b.label, b.x + w / 2, this.offY + 26);
      ctx.fillStyle = C.amber;
      ctx.font = `700 ${clamp(Math.floor(w / 6), 12, 26)}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText(b.value, b.x + w / 2, this.offY + 62);
    }

    // Mission panel under the left box.
    if (this.mission) {
      const x = 7;
      ctx.fillStyle = '#141130';
      ctx.fillRect(x, this.offY + 128, w, 96);
      ctx.strokeStyle = C.teal;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, this.offY + 129, w - 2, 94);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.teal;
      ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
      ctx.fillText('MISSION', x + w / 2, this.offY + 152);
      ctx.fillStyle = C.ink;
      ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
      ctx.fillText(`${this.missionProgress}/${this.mission.goal}`, x + w / 2, this.offY + 196);
      ctx.fillStyle = C.dim;
      ctx.font = '600 10px ui-rounded, system-ui, sans-serif';
      ctx.fillText(this.mission.name.slice(0, 14), x + w / 2, this.offY + 174);
    }
  }
}

export { MISSIONS, RANKS, SURF, lerp };
