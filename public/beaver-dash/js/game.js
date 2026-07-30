/*
 * Beaver Dash — an endless runner. The beaver runs on its own; the player owns
 * one input (jump, with a second jump in the air) and one rule: herons punish
 * jumping, everything else punishes staying down.
 *
 * All drawing is procedural Canvas2D in the Beaver Games palette.
 */

import { sfx } from './audio.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
const chance = (p) => Math.random() < p;

/* Palette (Beaver Games design tokens). */
const C = {
  bg: '#12101c',
  bgDeep: '#0c0a14',
  line: '#2b2646',
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
  water: '#274a63',
};

const METER = 42; // logical px per metre
const ACORN_POINTS = 25;
const GOLDEN_POINTS = 250;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'menu'; // menu | playing | dead
    this.time = 0;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.hooks = {};
    this._raf = null;
    this._last = 0;
    this.resize();
    this.resetWorld();
  }

  on(name, fn) {
    this.hooks[name] = fn;
  }

  emit(name, ...args) {
    if (this.hooks[name]) this.hooks[name](...args);
  }

  /* ---------------------------------------------------------------- sizing -- */

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(280, Math.round(rect.width));
    this.h = Math.max(240, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One unit scales the whole world off a 420px-tall reference.
    this.u = clamp(this.h / 420, 0.7, 2);
    this.groundY = this.h * 0.8;
    if (this.beaver) {
      this.beaver.x = this.w * 0.24;
      if (this.beaver.y > this.groundY) this.beaver.y = this.groundY;
    }
    this.buildBackdrop();
  }

  /* ----------------------------------------------------------------- world -- */

  resetWorld() {
    const u = this.u;
    this.speed = 300 * u; // world scroll px/s
    this.baseSpeed = this.speed;
    this.distance = 0;
    this.score = 0;
    this.acorns = 0;
    this.milestone = 500;
    this.obstacles = [];
    this.pickups = [];
    this.particles = [];
    this.spawnX = this.w * 2.3; // quiet opening stretch before the first obstacle
    this.shake = 0;
    this.flash = 0;
    this.heronWarn = 0;

    this.beaver = {
      x: this.w * 0.24,
      y: this.groundY,
      vy: 0,
      w: 46 * u,
      h: 34 * u,
      onGround: true,
      jumps: 0,
      coyote: 0,
      holdBoost: 0,
      runT: 0,
      tumble: 0,
      blink: 0,
    };
  }

  buildBackdrop() {
    // Pre-render the static sky so the per-frame cost is two drawImages.
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.ceil(this.w));
    c.height = Math.max(2, Math.ceil(this.h));
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, '#181430');
    grad.addColorStop(0.55, C.bg);
    grad.addColorStop(1, C.bgDeep);
    g.fillStyle = grad;
    g.fillRect(0, 0, this.w, this.h);

    // Moon
    const mx = this.w * 0.78;
    const my = this.h * 0.2;
    const mr = 26 * this.u;
    const halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(255,180,61,0.35)');
    halo.addColorStop(1, 'rgba(255,180,61,0)');
    g.fillStyle = halo;
    g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    g.fillStyle = C.amber;
    g.beginPath();
    g.arc(mx, my, mr, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(18,16,28,0.25)';
    g.beginPath();
    g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, TAU);
    g.arc(mx + mr * 0.25, my + mr * 0.28, mr * 0.14, 0, TAU);
    g.fill();

    // Stars
    for (let i = 0; i < 60; i++) {
      g.globalAlpha = rand(0.7, 0.15);
      g.fillStyle = '#f6efe3';
      const sz = rand(2.2, 0.8) * this.u;
      g.fillRect(rand(this.w), rand(this.h * 0.55), sz, sz);
    }
    g.globalAlpha = 1;
    this.sky = c;

    // Parallax hill/tree layers scroll; seeded once per size.
    this.layers = [
      { speed: 0.15, color: '#1b1830', trees: this.makeTreeline(0.62, 60, 26) },
      { speed: 0.35, color: '#221d3d', trees: this.makeTreeline(0.7, 44, 42) },
    ];
    this.layerOffsets = [0, 0];
  }

  makeTreeline(yFrac, step, height) {
    const pts = [];
    const n = Math.ceil(this.w / (step * this.u)) + 3;
    for (let i = 0; i < n; i++) {
      pts.push({ h: rand(height * 1.5, height * 0.6) * this.u, w: rand(step * 1.1, step * 0.7) * this.u });
    }
    return { yFrac, step: step * this.u, pts };
  }

  /* ------------------------------------------------------------------ loop -- */

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.05) dt = 0.05;
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
    this.emit('run-start');
  }

  frame(dt) {
    this.time += dt;
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dead') this.updateDead(dt);
    else this.updateMenu(dt);
    this.render();
  }

  /* ---------------------------------------------------------------- update -- */

  update(dt) {
    const u = this.u;
    const b = this.beaver;

    // Speed ramps with distance, capped so late game stays humanly readable.
    this.speed = Math.min(this.baseSpeed * 2.6, this.baseSpeed * (1 + this.distance / 2200));
    // Metres are unit-normalised so a tall phone and a small stage measure the
    // same run identically (speed scales with u, so u cancels out).
    this.distance += (this.speed * dt) / (METER * u);
    this.score = Math.floor(this.distance) + this.acorns * ACORN_POINTS + (this.goldenTaken || 0) * GOLDEN_POINTS;

    if (this.distance >= this.milestone) {
      sfx.milestone();
      this.emit('milestone', this.milestone);
      this.milestone += 500;
      this.flash = this.reduceMotion ? 0 : 0.25;
    }

    /* --- beaver physics --- */
    const gravity = 2600 * u;
    b.vy += gravity * dt;
    // Holding jump floats the apex a little (variable jump height).
    if (this.jumpHeld && b.vy < 0) b.vy -= gravity * 0.42 * dt;
    b.y += b.vy * dt;
    if (b.y >= this.groundY) {
      if (!b.onGround) sfx.land();
      b.y = this.groundY;
      b.vy = 0;
      b.onGround = true;
      b.jumps = 0;
      b.coyote = 0.09;
    } else {
      b.onGround = false;
      b.coyote = Math.max(0, b.coyote - dt);
    }
    b.runT += dt * (this.speed / (34 * u));
    b.blink = Math.max(0, b.blink - dt);
    if (chance(dt * 0.4)) b.blink = 0.12;

    /* --- spawning --- */
    this.spawnX -= this.speed * dt;
    if (this.spawnX < this.w) this.spawnNext();

    /* --- obstacles --- */
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.x -= this.speed * dt * (o.vx || 1);
      if (o.kind === 'heron') {
        o.t += dt;
        o.y = o.baseY + Math.sin(o.t * 5) * 6 * u;
        if (!o.warned && o.x < this.w * 0.85) {
          o.warned = true;
          sfx.heron();
        }
      }
      if (o.x < -o.w * 2) {
        this.obstacles.splice(i, 1);
        continue;
      }
      if (this.hit(b, o)) {
        this.crash(o);
        return;
      }
    }

    /* --- pickups --- */
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.x -= this.speed * dt;
      p.t += dt;
      if (p.x < -30 * u) {
        this.pickups.splice(i, 1);
        continue;
      }
      const dx = p.x - b.x;
      const dy = p.y - (b.y - b.h * 0.5);
      if (dx * dx + dy * dy < (26 * u) ** 2) {
        this.pickups.splice(i, 1);
        if (p.golden) {
          this.goldenTaken = (this.goldenTaken || 0) + 1;
          sfx.golden();
          this.burst(p.x, p.y, C.amber, 14);
          this.emit('pickup', 'golden');
        } else {
          this.acorns += 1;
          sfx.acorn();
          this.burst(p.x, p.y, C.teal, 6);
        }
      }
    }

    /* --- particles / juice --- */
    this.updateParticles(dt);
    if (b.onGround && chance(dt * 14)) {
      this.particles.push({
        x: b.x - b.w * 0.4,
        y: this.groundY,
        vx: -rand(60, 20) * u,
        vy: -rand(60, 10) * u,
        life: rand(0.4, 0.2),
        max: 0.4,
        size: rand(3, 1.5) * u,
        color: 'rgba(140,120,150,0.5)',
      });
    }
    this.shake *= Math.pow(0.002, dt);
    this.flash = Math.max(0, this.flash - dt * 2);
    this.heronWarn = Math.max(0, this.heronWarn - dt);
    this.emit('hud');
  }

  updateMenu(dt) {
    const b = this.beaver;
    b.runT += dt * 6;
    this.layerScroll(dt, 0.3);
    this.updateParticles(dt);
  }

  updateDead(dt) {
    const b = this.beaver;
    b.tumble += dt * 9;
    if (b.y < this.groundY + this.h * 0.4) {
      b.vy += 2600 * this.u * dt;
      b.y += b.vy * dt;
      b.x -= this.speed * 0.35 * dt;
    }
    this.updateParticles(dt);
    this.shake *= Math.pow(0.002, dt);
  }

  layerScroll(dt, mul = 1) {
    for (let i = 0; i < this.layers.length; i++) {
      this.layerOffsets[i] = (this.layerOffsets[i] + this.speed * this.layers[i].speed * mul * dt);
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 900 * this.u * dt * (p.float ? 0 : 1);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      const s = rand(180, 40) * this.u;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60 * this.u,
        life: rand(0.5, 0.2),
        max: 0.5,
        size: rand(3.4, 1.6) * this.u,
        color,
      });
    }
  }

  /* -------------------------------------------------------------- spawning -- */

  spawnNext() {
    const u = this.u;
    const d = this.distance;
    // Difficulty ramps: tighter gaps and more heron/wide patterns later.
    const t = clamp(d / 3000, 0, 1);
    const gapMeters = rand(lerp(19, 11, t), lerp(11, 7.5, t));
    const x = this.w + 90 * u;

    const roll = Math.random();
    if (d > 260 && roll < lerp(0.12, 0.3, t)) {
      // Heron: flies at jump height — the answer is to STAY DOWN.
      const baseY = this.groundY - 66 * u;
      this.obstacles.push({ kind: 'heron', x, y: baseY, baseY, w: 52 * u, h: 26 * u, t: rand(TAU), vx: 1.22, warned: false });
      this.heronWarn = 0.8;
    } else if (d > 600 && roll < lerp(0.3, 0.55, t) && chance(0.5)) {
      // Log pile: wide — usually needs the double jump.
      this.obstacles.push({ kind: 'logs', x, y: this.groundY, w: rand(120, 86) * u, h: 34 * u });
    } else if (chance(0.5)) {
      this.obstacles.push({ kind: 'stump', x, y: this.groundY, w: 34 * u, h: rand(46, 30) * u });
    } else {
      this.obstacles.push({ kind: 'rock', x, y: this.groundY, w: rand(56, 40) * u, h: rand(40, 26) * u });
    }

    // Acorn arcs over some ground obstacles, lines elsewhere.
    if (chance(0.55)) {
      const n = 3 + Math.floor(rand(3));
      const arc = chance(0.5);
      for (let i = 0; i < n; i++) {
        const fx = x + (i - (n - 1) / 2) * 30 * u;
        const fy = arc
          ? this.groundY - 90 * u - Math.sin((i / (n - 1)) * Math.PI) * 46 * u
          : this.groundY - 34 * u;
        this.pickups.push({ x: fx + 170 * u, y: fy, t: rand(TAU), golden: false });
      }
    }
    if (chance(0.05)) {
      this.pickups.push({ x: x + rand(300, 120) * u, y: this.groundY - rand(150, 70) * u, t: 0, golden: true });
    }

    this.spawnX = x + gapMeters * METER * u * (this.speed / this.baseSpeed) * 0.75;
  }

  /* ------------------------------------------------------------- collision -- */

  hit(b, o) {
    // Beaver hitbox, forgiving on purpose.
    const bx = b.x - b.w * 0.32;
    const bw = b.w * 0.64;
    const by = b.y - b.h * 0.86;
    const bh = b.h * 0.82;
    const ox = o.x - o.w * 0.5 + o.w * 0.1;
    const ow = o.w * 0.8;
    const oyTop = o.kind === 'heron' ? o.y - o.h * 0.4 : o.y - o.h;
    const oh = o.kind === 'heron' ? o.h * 0.8 : o.h;
    return bx < ox + ow && bx + bw > ox && by < oyTop + oh && by + bh > oyTop;
  }

  crash(o) {
    this.state = 'dead';
    const b = this.beaver;
    b.vy = -520 * this.u;
    b.tumble = 0.01;
    this.shake = this.reduceMotion ? 0 : 14;
    this.flash = this.reduceMotion ? 0 : 0.4;
    this.burst(b.x, b.y - b.h * 0.5, C.fur, 12);
    this.burst(b.x, b.y - b.h * 0.5, C.red, 8);
    sfx.crash();
    setTimeout(() => sfx.gameover(), 450);
    this.emit('gameover', {
      score: this.score,
      distance: Math.floor(this.distance),
      acorns: this.acorns,
      golden: this.goldenTaken || 0,
      cause: o.kind,
    });
  }

  /* ----------------------------------------------------------------- input -- */

  jumpDown() {
    if (this.state !== 'playing') return false;
    const b = this.beaver;
    this.jumpHeld = true;
    if (b.onGround || b.coyote > 0) {
      b.vy = -940 * this.u;
      b.onGround = false;
      b.coyote = 0;
      b.jumps = 1;
      sfx.jump(false);
      return true;
    }
    if (b.jumps === 1) {
      b.vy = -860 * this.u;
      b.jumps = 2;
      sfx.jump(true);
      this.burst(b.x, b.y, 'rgba(246,239,227,0.7)', 6);
      return true;
    }
    return false;
  }

  jumpUp() {
    this.jumpHeld = false;
  }

  /* ---------------------------------------------------------------- render -- */

  render() {
    const ctx = this.ctx;
    const u = this.u;
    ctx.save();
    if (this.shake > 0.3) ctx.translate(rand(this.shake, -this.shake) * 0.5, rand(this.shake, -this.shake) * 0.5);

    ctx.drawImage(this.sky, 0, 0, this.w, this.h);

    // Parallax treelines
    if (this.state === 'playing') this.layerScroll(1 / 60);
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      const line = layer.trees;
      const y = this.h * line.yFrac;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, this.h);
      ctx.lineTo(0, y);
      let x = -(this.layerOffsets[i] % line.step) - line.step;
      let k = Math.floor(this.layerOffsets[i] / line.step);
      while (x < this.w + line.step) {
        const p = line.pts[((k % line.pts.length) + line.pts.length) % line.pts.length];
        ctx.lineTo(x + p.w * 0.5, y - p.h);
        ctx.lineTo(x + p.w, y);
        x += p.w;
        k += 1;
      }
      ctx.lineTo(this.w, this.h);
      ctx.closePath();
      ctx.fill();
    }

    // River strip behind the ground
    ctx.fillStyle = C.water;
    ctx.fillRect(0, this.groundY - 8 * u, this.w, 8 * u);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = C.teal;
    for (let i = 0; i < 5; i++) {
      const wx = ((this.time * 40 * u * (1 + i * 0.2)) % (this.w + 80 * u)) - 40 * u;
      ctx.fillRect(this.w - wx, this.groundY - 7 * u + i * 1.2 * u, 26 * u, 1.4 * u);
    }
    ctx.globalAlpha = 1;

    // Ground
    ctx.fillStyle = '#1e1936';
    ctx.fillRect(0, this.groundY, this.w, this.h - this.groundY);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY + 1);
    ctx.lineTo(this.w, this.groundY + 1);
    ctx.stroke();
    // Scrolling ground dashes
    ctx.fillStyle = 'rgba(123,92,255,0.25)';
    const dashGap = 90 * u;
    let dx = -((this.distance * METER * 0.9) % dashGap);
    while (dx < this.w) {
      ctx.fillRect(dx, this.groundY + 14 * u, 34 * u, 3 * u);
      dx += dashGap;
    }

    for (const p of this.pickups) this.drawPickup(ctx, p);
    for (const o of this.obstacles) this.drawObstacle(ctx, o);
    this.drawBeaver(ctx);

    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
  }

  drawPickup(ctx, p) {
    const u = this.u;
    const bob = Math.sin(p.t * 5) * 3 * u;
    const r = (p.golden ? 12 : 8) * u;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    if (p.golden) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = C.amber;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8 + Math.sin(p.t * 8) * 2 * u, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Acorn: cap + body
    ctx.fillStyle = p.golden ? C.amber : '#c98d4e';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.7, r * 0.75, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.golden ? '#b57b13' : C.woodDark;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.8, r * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(-r * 0.1, -r * 0.95, r * 0.2, r * 0.4);
    ctx.restore();
  }

  drawObstacle(ctx, o) {
    const u = this.u;
    ctx.save();
    ctx.translate(o.x, o.y);
    switch (o.kind) {
      case 'stump': {
        ctx.fillStyle = C.woodDark;
        ctx.fillRect(-o.w / 2, -o.h, o.w, o.h);
        ctx.fillStyle = C.wood;
        ctx.fillRect(-o.w / 2 + 3 * u, -o.h, o.w - 6 * u, o.h);
        ctx.fillStyle = C.woodDark;
        ctx.beginPath();
        ctx.ellipse(0, -o.h, o.w * 0.5, 6 * u, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.furLight;
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.ellipse(0, -o.h, o.w * 0.28, 3.4 * u, 0, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'rock': {
        ctx.fillStyle = C.stone;
        ctx.beginPath();
        ctx.moveTo(-o.w / 2, 0);
        ctx.lineTo(-o.w * 0.34, -o.h * 0.85);
        ctx.lineTo(0, -o.h);
        ctx.lineTo(o.w * 0.3, -o.h * 0.7);
        ctx.lineTo(o.w / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(246,239,227,0.12)';
        ctx.beginPath();
        ctx.moveTo(-o.w * 0.34, -o.h * 0.85);
        ctx.lineTo(0, -o.h);
        ctx.lineTo(0, 0);
        ctx.lineTo(-o.w * 0.2, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'logs': {
        // A pile: two logs on the bottom, one on top.
        const lw = o.w;
        const lh = 14 * u;
        const log = (lx, ly, len) => {
          ctx.fillStyle = C.wood;
          ctx.fillRect(lx - len / 2, ly - lh, len, lh);
          ctx.fillStyle = C.woodDark;
          ctx.fillRect(lx - len / 2, ly - lh, len, 3 * u);
          ctx.beginPath();
          ctx.arc(lx + len / 2, ly - lh / 2, lh / 2, 0, TAU);
          ctx.fillStyle = C.furLight;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lx + len / 2, ly - lh / 2, lh / 4, 0, TAU);
          ctx.fillStyle = C.woodDark;
          ctx.fill();
        };
        log(-o.w * 0.18, 0, lw * 0.62);
        log(o.w * 0.2, 0, lw * 0.56);
        log(0, -lh, lw * 0.5);
        break;
      }
      case 'heron': {
        const flap = Math.sin(o.t * 10) * 0.8;
        ctx.fillStyle = '#b9b1d4';
        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, o.w * 0.3, o.h * 0.4, 0, 0, TAU);
        ctx.fill();
        // Neck + head
        ctx.strokeStyle = '#b9b1d4';
        ctx.lineWidth = 4 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-o.w * 0.24, -o.h * 0.1);
        ctx.quadraticCurveTo(-o.w * 0.44, -o.h * 0.5, -o.w * 0.52, -o.h * 0.34);
        ctx.stroke();
        ctx.fillStyle = C.amber;
        ctx.beginPath();
        ctx.moveTo(-o.w * 0.52, -o.h * 0.4);
        ctx.lineTo(-o.w * 0.72, -o.h * 0.3);
        ctx.lineTo(-o.w * 0.52, -o.h * 0.22);
        ctx.closePath();
        ctx.fill();
        // Wings
        ctx.fillStyle = '#8d85ab';
        ctx.beginPath();
        ctx.moveTo(0, -o.h * 0.1);
        ctx.quadraticCurveTo(o.w * 0.2, -o.h * (0.9 + flap * 0.5), o.w * 0.42, -o.h * (0.3 + flap * 0.4));
        ctx.quadraticCurveTo(o.w * 0.15, -o.h * 0.05, 0, 0);
        ctx.closePath();
        ctx.fill();
        // Trailing legs
        ctx.strokeStyle = '#6f6795';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(o.w * 0.22, o.h * 0.3);
        ctx.lineTo(o.w * 0.44, o.h * 0.42);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawBeaver(ctx) {
    const u = this.u;
    const b = this.beaver;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (this.state === 'dead') ctx.rotate(b.tumble);
    else if (!b.onGround) ctx.rotate(clamp(b.vy / (2200 * u), -0.3, 0.35));

    const w = b.w;
    const h = b.h;
    const run = Math.sin(b.runT * TAU);

    // Tail: the flat paddle, slaps as it runs.
    ctx.save();
    ctx.translate(-w * 0.42, -h * 0.42);
    ctx.rotate(-0.5 + (b.onGround ? run * 0.16 : -0.28));
    ctx.fillStyle = C.furDark;
    ctx.beginPath();
    ctx.ellipse(-w * 0.24, 0, w * 0.3, h * 0.22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,16,28,0.5)';
    ctx.lineWidth = 1.2 * u;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.44, i * h * 0.09);
      ctx.lineTo(-w * 0.06, i * h * 0.09);
      ctx.stroke();
    }
    ctx.restore();

    // Legs (simple run cycle)
    ctx.strokeStyle = C.furDark;
    ctx.lineWidth = 5 * u;
    ctx.lineCap = 'round';
    const legSwing = b.onGround ? run : 0.6;
    ctx.beginPath();
    ctx.moveTo(-w * 0.14, -h * 0.16);
    ctx.lineTo(-w * 0.14 + legSwing * w * 0.14, 0);
    ctx.moveTo(w * 0.14, -h * 0.16);
    ctx.lineTo(w * 0.14 - legSwing * w * 0.14, 0);
    ctx.stroke();

    // Body
    const bodyBob = b.onGround ? Math.abs(run) * h * 0.05 : 0;
    ctx.save();
    ctx.translate(0, -h * 0.52 - bodyBob);
    const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    grad.addColorStop(0, C.furLight);
    grad.addColorStop(0.5, C.fur);
    grad.addColorStop(1, C.furDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.42, h * 0.5, 0, 0, TAU);
    ctx.fill();
    // Belly
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(w * 0.08, h * 0.14, w * 0.22, h * 0.3, 0, 0, TAU);
    ctx.fill();

    // Head
    ctx.save();
    ctx.translate(w * 0.3, -h * 0.3);
    ctx.fillStyle = C.fur;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.24, h * 0.32, 0, 0, TAU);
    ctx.fill();
    // Ear
    ctx.fillStyle = C.furDark;
    ctx.beginPath();
    ctx.arc(-w * 0.1, -h * 0.26, w * 0.07, 0, TAU);
    ctx.fill();
    // Muzzle
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(w * 0.12, h * 0.1, w * 0.13, h * 0.14, 0, 0, TAU);
    ctx.fill();
    // Nose
    ctx.fillStyle = '#241f3d';
    ctx.beginPath();
    ctx.ellipse(w * 0.2, h * 0.02, w * 0.05, h * 0.045, 0, 0, TAU);
    ctx.fill();
    // Teeth — the beaver essential.
    ctx.fillStyle = C.ink;
    ctx.fillRect(w * 0.13, h * 0.16, w * 0.05, h * 0.12);
    ctx.fillRect(w * 0.19, h * 0.16, w * 0.05, h * 0.12);
    ctx.strokeStyle = 'rgba(18,16,28,0.4)';
    ctx.lineWidth = 0.8 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.185, h * 0.16);
    ctx.lineTo(w * 0.185, h * 0.28);
    ctx.stroke();
    // Eye
    if (b.blink > 0 || this.state === 'dead') {
      ctx.strokeStyle = '#241f3d';
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(w * 0.02, -h * 0.08);
      ctx.lineTo(w * 0.1, -h * 0.06);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#241f3d';
      ctx.beginPath();
      ctx.arc(w * 0.06, -h * 0.07, w * 0.045, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(w * 0.075, -h * 0.085, w * 0.015, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Little arms
    ctx.strokeStyle = C.furDark;
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(w * 0.18, -h * 0.05);
    ctx.lineTo(w * 0.3, h * 0.06 + (b.onGround ? run * h * 0.05 : -h * 0.08));
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
