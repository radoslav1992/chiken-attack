/* Particles, shockwaves and floating score text – all pooled. */

import { Pool, TAU, rand, clamp, pick } from './util.js';

export class Effects {
  constructor(game) {
    this.game = game;

    this.particles = new Pool(
      () => ({}),
      (p, o) => {
        p.x = o.x;
        p.y = o.y;
        p.vx = o.vx;
        p.vy = o.vy;
        p.life = o.life;
        p.maxLife = o.life;
        p.size = o.size;
        p.color = o.color;
        p.type = o.type || 'spark';
        p.rot = o.rot || 0;
        p.spin = o.spin || 0;
        p.drag = o.drag ?? 1.6;
        p.gravity = o.gravity ?? 0;
        p.frame = o.frame || 0;
        p.additive = o.additive ?? p.type === 'spark';
      }
    );

    this.waves = new Pool(
      () => ({}),
      (w, o) => {
        w.x = o.x;
        w.y = o.y;
        w.r = o.r0 || 0;
        w.maxR = o.maxR;
        w.life = o.life;
        w.maxLife = o.life;
        w.color = o.color;
        w.width = o.width || 3;
      }
    );

    this.texts = new Pool(
      () => ({}),
      (t, o) => {
        t.x = o.x;
        t.y = o.y;
        t.text = o.text;
        t.color = o.color;
        t.life = o.life || 1.0;
        t.maxLife = t.life;
        t.size = o.size || 14;
        t.vy = o.vy ?? -34;
      }
    );
  }

  clear() {
    this.particles.clear();
    this.waves.clear();
    this.texts.clear();
  }

  /* ------------------------------------------------------------- spawners -- */

  spark(x, y, opts = {}) {
    const u = this.game.unit;
    this.particles.spawn({
      x,
      y,
      vx: opts.vx ?? rand(90, -90) * u,
      vy: opts.vy ?? rand(90, -90) * u,
      life: opts.life ?? rand(0.45, 0.2),
      size: (opts.size ?? rand(3.2, 1.4)) * u,
      color: opts.color || '#ffd166',
      type: 'spark',
      drag: opts.drag ?? 2.2,
    });
  }

  burst(x, y, n, opts = {}) {
    const u = this.game.unit;
    const speed = (opts.speed ?? 200) * u;
    for (let i = 0; i < n; i++) {
      const a = opts.angle != null ? opts.angle + rand(opts.spread ?? 0.6, -(opts.spread ?? 0.6)) : rand(TAU);
      const s = speed * rand(1, 0.25);
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(opts.life ?? 0.55, (opts.life ?? 0.55) * 0.4),
        size: rand(opts.size ?? 3.4, 1.2) * u,
        color: Array.isArray(opts.color) ? pick(opts.color) : opts.color || '#ffd166',
        type: opts.type || 'spark',
        drag: opts.drag ?? 2,
        gravity: opts.gravity ?? 0,
        spin: rand(9, -9),
      });
    }
  }

  explosion(x, y, size = 1, color = '#ff9f43') {
    const u = this.game.unit;
    this.burst(x, y, Math.round(12 * size), {
      speed: 190 * size,
      size: 4 * size,
      life: 0.55 * size,
      color: ['#fff3bf', color, '#ff6b6b'],
    });
    this.burst(x, y, Math.round(7 * size), {
      speed: 90 * size,
      size: 9 * size,
      life: 0.9 * size,
      color: 'rgba(120,110,110,0.55)',
      type: 'smoke',
      drag: 1.1,
    });
    this.waves.spawn({
      x,
      y,
      maxR: 46 * size * u,
      life: 0.34,
      color: 'rgba(255,220,170,0.9)',
      width: 3 * size,
    });
  }

  /** Chicken death: feathers, a meat puff and a squawk of sparks. */
  feathers(x, y, n = 8, tint = 0) {
    const u = this.game.unit;
    for (let i = 0; i < n; i++) {
      const a = rand(TAU);
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(a) * rand(150, 40) * u,
        vy: Math.sin(a) * rand(150, 40) * u,
        life: rand(1.5, 0.8),
        size: rand(1.25, 0.7),
        color: '#fff',
        type: 'feather',
        rot: rand(TAU),
        spin: rand(6, -6),
        drag: 1.4,
        gravity: 40 * u,
        frame: tint,
      });
    }
    this.burst(x, y, 6, { speed: 150, size: 3, life: 0.4, color: ['#ffe066', '#ffa94d', '#fff'] });
  }

  splat(x, y, color = '#fff8e1') {
    const u = this.game.unit;
    for (let i = 0; i < 9; i++) {
      const a = rand(-Math.PI, 0);
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(a) * rand(160, 40) * u,
        vy: Math.sin(a) * rand(160, 40) * u,
        life: rand(0.5, 0.25),
        size: rand(3.5, 1.6) * u,
        color,
        type: 'goo',
        drag: 2.4,
        gravity: 260 * u,
      });
    }
  }

  trail(x, y, color, size = 2.4) {
    this.particles.spawn({
      x,
      y,
      vx: rand(24, -24) * this.game.unit,
      vy: rand(60, 10) * this.game.unit,
      life: rand(0.35, 0.15),
      size: size * this.game.unit,
      color,
      type: 'spark',
      drag: 2.6,
    });
  }

  shockwave(x, y, maxR, color = 'rgba(255,255,255,0.85)', life = 0.5, width = 4) {
    this.waves.spawn({ x, y, maxR, life, color, width });
  }

  text(str, x, y, color = '#fff', size = 14, life = 0.9) {
    this.texts.spawn({ text: str, x, y, color, size: size * this.game.unit, life });
  }

  /* --------------------------------------------------------------- update -- */

  update(dt) {
    this.particles.forEach((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        return;
      }
      const drag = Math.pow(0.5, dt * p.drag);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    });
    this.particles.sweep();

    this.waves.forEach((w) => {
      w.life -= dt;
      if (w.life <= 0) {
        w.dead = true;
        return;
      }
      const t = 1 - w.life / w.maxLife;
      w.r = w.maxR * (1 - Math.pow(1 - t, 2.2));
    });
    this.waves.sweep();

    this.texts.forEach((t) => {
      t.life -= dt;
      if (t.life <= 0) {
        t.dead = true;
        return;
      }
      t.y += t.vy * dt * this.game.unit;
      t.vy *= Math.pow(0.4, dt);
    });
    this.texts.sweep();
  }

  /* ---------------------------------------------------------------- paint -- */

  draw(ctx, art) {
    // Non-additive first (smoke, goo, feathers), then glowing sparks.
    ctx.save();
    this.particles.forEach((p) => {
      if (p.additive) return;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'feather') {
        art.draw(ctx, 'feather', p.x, p.y, p.rot, p.size, a, p.frame);
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size, p.size * 1.25, 0, 0, TAU);
        ctx.fill();
      }
    });
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.particles.forEach((p) => {
      if (!p.additive) return;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, TAU);
      ctx.fill();
    });

    this.waves.forEach((w) => {
      const a = clamp(w.life / w.maxLife, 0, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width * this.game.unit * a;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.texts.forEach((t) => {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.font = `900 ${Math.round(t.size)}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, t.size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    });
    ctx.restore();
  }
}
