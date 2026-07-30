/*
 * Enemies: the chicken flock (four breeds, six flight behaviours), asteroids,
 * bonus UFOs and the boss chickens.
 */

import { TAU, rand, randInt, chance, clamp, lerp, angleTo, easeOutCubic, pick } from './util.js';
import { sfx, vibrate } from './audio.js';

/* ------------------------------------------------------------------- base -- */

class Enemy {
  constructor(game) {
    this.game = game;
    this.dead = false;
    this.flash = 0;
    this.entering = false;
    this.hitRadiusScale = 1;
  }

  hurt(dmg, source) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = Math.min(1, this.flash + 0.55);
    if (this.hp <= 0) {
      this.die(source);
      return true;
    }
    sfx.hitEnemy();
    return false;
  }

  die() {
    this.dead = true;
  }
}

/* ---------------------------------------------------------------- chicken -- */

const BREEDS = {
  white: { key: 'chicken_white', hp: 1, score: 100, size: 20, food: 0.55, pitch: 1 },
  brown: { key: 'chicken_brown', hp: 2.6, score: 220, size: 22, food: 0.7, pitch: 0.85 },
  metal: { key: 'chicken_metal', hp: 6.5, score: 420, size: 23, food: 0.85, pitch: 0.7 },
  chick: { key: 'chicken_chick', hp: 0.55, score: 60, size: 13, food: 0.3, pitch: 1.5 },
};

export class Chicken extends Enemy {
  /**
   * @param {object} opts mode + per-mode parameters, supplied by the wave
   *   builder. Supported modes: slot, orbit, sine, dive, fall, chase.
   */
  constructor(game, opts) {
    super(game);
    const b = BREEDS[opts.breed || 'white'];
    this.breed = opts.breed || 'white';
    this.spriteKey = b.key;
    this.pitch = b.pitch;
    this.foodChance = b.food;
    this.baseScore = b.score;

    const diff = game.difficulty;
    this.maxHp = Math.max(1, b.hp * diff.hp);
    this.hp = this.maxHp;
    this.r = b.size * game.unit;
    this.scale = 1;

    this.mode = opts.mode || 'slot';
    this.p = opts; // raw params
    this.x = opts.x ?? game.w * 0.5;
    this.y = opts.y ?? -40 * game.unit;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.wobble = rand(TAU);
    this.flapSpeed = rand(11, 7);
    this.layTimer = rand(4.5, 0.8) / diff.layRate;
    this.canLay = opts.canLay !== false;
    this.age = 0;

    // Fly-in from off screen.
    this.entering = opts.entering !== false;
    this.enterT = 0;
    this.enterDur = opts.enterDur ?? rand(1.5, 1.0);
    this.enterFrom = opts.enterFrom || { x: this.x, y: -60 * game.unit };
    this.enterVia = opts.enterVia || null;
    this.slotIndex = opts.slotIndex ?? 0;

    if (this.mode === 'sine') {
      this.entering = false;
      this.dir = opts.dir ?? 1;
      this.speed = (opts.speed ?? 120) * game.unit * diff.speed;
      this.amp = (opts.amp ?? 60) * game.unit;
      this.freq = opts.freq ?? 1.4;
      this.baseY = this.y;
    }
    if (this.mode === 'fall') {
      this.entering = false;
      this.speed = (opts.speed ?? 90) * game.unit * diff.speed;
      this.sway = (opts.sway ?? 40) * game.unit;
    }
    if (this.mode === 'orbit') {
      this.angle = opts.angle ?? 0;
      this.orbitR = (opts.orbitR ?? 90) * game.unit;
      this.orbitSpeed = (opts.orbitSpeed ?? 0.7) * diff.speed;
    }
    if (this.mode === 'dive') {
      this.diveState = 'wait';
      this.diveDelay = opts.diveDelay ?? rand(6, 1);
    }
    if (this.mode === 'chase') {
      this.entering = false;
      this.speed = (opts.speed ?? 70) * game.unit * diff.speed;
    }
  }

  get score() {
    return Math.round(this.baseScore * this.game.scoreMult);
  }

  /** Where this chicken wants to be, in world coordinates. */
  slotPos() {
    const f = this.game.formation;
    return f.slotPos(this.slotIndex, this);
  }

  update(dt) {
    const g = this.game;
    const u = g.unit;
    this.age += dt;
    this.wobble += dt * this.flapSpeed;
    this.flash = Math.max(0, this.flash - dt * 3.4);

    if (this.entering) {
      this.enterT += dt / this.enterDur;
      const t = easeOutCubic(clamp(this.enterT, 0, 1));
      const target = this.mode === 'orbit' ? this.orbitPos() : this.slotPos();
      const from = this.enterFrom;
      if (this.enterVia) {
        // Quadratic curve for a sweeping entrance.
        const it = 1 - t;
        this.x = it * it * from.x + 2 * it * t * this.enterVia.x + t * t * target.x;
        this.y = it * it * from.y + 2 * it * t * this.enterVia.y + t * t * target.y;
      } else {
        this.x = lerp(from.x, target.x, t);
        this.y = lerp(from.y, target.y, t);
      }
      if (this.enterT >= 1) this.entering = false;
    } else {
      switch (this.mode) {
        case 'slot': {
          const target = this.slotPos();
          const k = 1 - Math.pow(0.0006, dt);
          this.x = lerp(this.x, target.x + Math.sin(this.wobble * 0.5) * 3 * u, k);
          this.y = lerp(this.y, target.y + Math.sin(this.wobble * 0.7) * 4 * u, k);
          break;
        }
        case 'orbit': {
          this.angle += this.orbitSpeed * dt;
          const p = this.orbitPos();
          this.x = p.x;
          this.y = p.y;
          break;
        }
        case 'sine': {
          this.x += this.speed * this.dir * dt;
          this.baseY += (this.p.descend ?? 0) * u * dt;
          this.y = this.baseY + Math.sin(this.x / (60 * u) * this.freq) * this.amp;
          if (this.dir > 0 && this.x > g.w + 60 * u) this.dead = true;
          if (this.dir < 0 && this.x < -60 * u) this.dead = true;
          if (this.dead) this.escaped = true;
          break;
        }
        case 'fall': {
          this.y += this.speed * dt;
          this.x += Math.cos(this.age * 1.7 + this.wobble) * this.sway * dt;
          if (this.y > g.h + 50 * u) {
            this.dead = true;
            this.escaped = true;
          }
          break;
        }
        case 'chase': {
          const p = g.player;
          if (p && !p.dead) {
            const a = angleTo(this.x, this.y, p.x, p.y);
            this.vx = lerp(this.vx, Math.cos(a) * this.speed, dt * 1.6);
            this.vy = lerp(this.vy, Math.sin(a) * this.speed, dt * 1.6);
          }
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (this.y > g.h + 60 * u) {
            this.dead = true;
            this.escaped = true;
          }
          break;
        }
        case 'dive':
          this.updateDive(dt);
          break;
      }
    }

    // Keep formation flyers on screen horizontally.
    if (this.mode === 'slot' || this.mode === 'dive') {
      this.x = clamp(this.x, this.r * 0.6, g.w - this.r * 0.6);
    }

    this.rot = clamp(this.vx / (400 * u), -0.4, 0.4);

    /* egg laying */
    if (this.canLay && !this.entering && this.y > 0 && this.y < g.h * 0.75) {
      this.layTimer -= dt;
      if (this.layTimer <= 0) {
        this.layTimer = rand(6.5, 2.2) / g.difficulty.layRate;
        this.layEgg();
      }
    }
  }

  orbitPos() {
    const f = this.game.formation;
    return {
      x: f.cx + Math.cos(this.angle) * this.orbitR,
      y: f.cy + Math.sin(this.angle) * this.orbitR * 0.62,
    };
  }

  updateDive(dt) {
    const g = this.game;
    const u = g.unit;
    if (this.diveState === 'wait') {
      const target = this.slotPos();
      const k = 1 - Math.pow(0.0008, dt);
      this.x = lerp(this.x, target.x, k);
      this.y = lerp(this.y, target.y, k);
      this.diveDelay -= dt;
      if (this.diveDelay <= 0) {
        this.diveState = 'dive';
        const p = g.player;
        const a = p && !p.dead ? angleTo(this.x, this.y, p.x, p.y) : Math.PI / 2;
        const sp = 300 * u * g.difficulty.speed;
        this.vx = Math.cos(a) * sp;
        this.vy = Math.abs(Math.sin(a) * sp) + 90 * u;
        sfx.cluck(this.pitch * 1.15);
      }
    } else if (this.diveState === 'dive') {
      // Slight homing while diving keeps the attack threatening.
      const p = g.player;
      if (p && !p.dead && this.y < p.y) {
        const a = angleTo(this.x, this.y, p.x, p.y);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = lerp(this.vx, Math.cos(a) * sp, dt * 1.1);
        this.vy = lerp(this.vy, Math.sin(a) * sp, dt * 1.1);
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.game.fx.trail(this.x, this.y + this.r * 0.4, 'rgba(255,255,255,0.35)', 1.6);
      if (this.y > g.h + this.r * 2) {
        // Loop back around from the top and rejoin the formation.
        this.diveState = 'wait';
        this.diveDelay = rand(9, 4);
        this.y = -this.r * 2;
        this.x = clamp(this.slotPos().x, this.r, g.w - this.r);
        this.vx = 0;
        this.vy = 0;
      }
    }
  }

  layEgg() {
    const g = this.game;
    if (g.enemyShots.length > 150) return;
    const big = this.breed === 'metal' && chance(0.35);
    g.spawnEgg(this.x, this.y + this.r * 0.6, {
      vx: this.vx * 0.25,
      vy: (big ? 150 : 190) * g.unit * g.difficulty.eggSpeed,
      kind: big ? 'bigEgg' : 'egg',
    });
    sfx.eggDrop();
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    g.fx.feathers(this.x, this.y, this.breed === 'chick' ? 5 : 9, this.breed === 'chick' ? 1 : 0);
    g.fx.explosion(this.x, this.y, this.breed === 'chick' ? 0.5 : 0.75, '#ffb703');
    sfx.cluck(this.pitch * rand(1.1, 0.9));
    g.addScore(this.score, this.x, this.y);
    g.onEnemyKilled(this, source);

    // Drumstick drop – the game's food economy.
    if (chance(this.foodChance)) g.spawnPickup(this.x, this.y, 'food');
    if (chance(0.035)) g.spawnPickup(this.x, this.y, g.rollGift());
  }

  draw(ctx, art, t) {
    const frame = this.entering || this.mode !== 'slot' ? Math.floor(this.wobble) % 3 : Math.floor(this.wobble * 0.7) % 3;
    art.draw(ctx, this.spriteKey, this.x, this.y, this.rot, this.scale, 1, frame);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 0.85;
      art.draw(ctx, this.spriteKey, this.x, this.y, this.rot, this.scale, 1, frame);
      ctx.restore();
    }
    // Damage pips for tough breeds.
    if (this.maxHp > 3 && this.hp < this.maxHp) {
      const w = this.r * 1.5;
      const frac = clamp(this.hp / this.maxHp, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(this.x - w / 2, this.y + this.r * 1.05, w, 3 * this.game.unit);
      ctx.fillStyle = frac > 0.5 ? '#69db7c' : frac > 0.25 ? '#ffd43b' : '#ff6b6b';
      ctx.fillRect(this.x - w / 2, this.y + this.r * 1.05, w * frac, 3 * this.game.unit);
      ctx.restore();
    }
  }
}

/* --------------------------------------------------------------- asteroid -- */

export class Asteroid extends Enemy {
  constructor(game, opts = {}) {
    super(game);
    this.big = opts.big !== false;
    this.variant = randInt(0, 3);
    this.r = (this.big ? 22 : 11) * game.unit * (opts.sizeMul || 1);
    this.maxHp = (this.big ? 14 : 5) * game.difficulty.hp;
    this.hp = this.maxHp;
    this.x = opts.x ?? rand(game.w);
    this.y = opts.y ?? -30 * game.unit;
    this.vx = opts.vx ?? rand(70, -70) * game.unit;
    this.vy = opts.vy ?? rand(190, 90) * game.unit * game.difficulty.speed;
    this.rot = rand(TAU);
    this.spin = rand(1.6, -1.6);
    this.baseScore = this.big ? 150 : 70;
    this.isAsteroid = true;
  }

  get score() {
    return Math.round(this.baseScore * this.game.scoreMult);
  }

  update(dt) {
    const g = this.game;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    this.flash = Math.max(0, this.flash - dt * 3.4);
    if (this.x < this.r && this.vx < 0) this.vx *= -1;
    if (this.x > g.w - this.r && this.vx > 0) this.vx *= -1;
    if (this.y > g.h + this.r * 2) {
      this.dead = true;
      this.escaped = true;
    }
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    g.fx.explosion(this.x, this.y, this.big ? 1.1 : 0.65, '#b0a49a');
    g.fx.burst(this.x, this.y, this.big ? 10 : 5, {
      speed: 150,
      size: 4,
      life: 0.7,
      color: ['#8a7f75', '#5e564f', '#c0b4a8'],
      type: 'goo',
      gravity: 60,
    });
    sfx.explosion(this.big ? 1.1 : 0.7);
    g.addScore(this.score, this.x, this.y);
    g.onEnemyKilled(this, source);
    if (this.big) {
      // Break apart into shards.
      const n = randInt(2, 4);
      for (let i = 0; i < n; i++) {
        const a = rand(TAU);
        g.addEnemy(
          new Asteroid(g, {
            big: false,
            x: this.x + Math.cos(a) * this.r * 0.4,
            y: this.y + Math.sin(a) * this.r * 0.4,
            vx: Math.cos(a) * rand(150, 60) * g.unit + this.vx * 0.4,
            vy: Math.abs(Math.sin(a)) * rand(120, 40) * g.unit + this.vy * 0.6,
          })
        );
      }
    } else if (chance(0.12)) {
      g.spawnPickup(this.x, this.y, chance(0.4) ? 'food' : g.rollGift());
    }
  }

  draw(ctx, art) {
    const key = this.big ? 'asteroid' : 'asteroidSmall';
    const scale = this.r / (art.radius(key, this.variant) || this.r);
    art.draw(ctx, key, this.x, this.y, this.rot, scale, 1, this.variant);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 0.7;
      art.draw(ctx, key, this.x, this.y, this.rot, scale, 1, this.variant);
      ctx.restore();
    }
  }
}

/* -------------------------------------------------------------------- ufo -- */

/** Bonus saucer: fast, tough-ish, always drops a gift. */
export class Ufo extends Enemy {
  constructor(game, opts = {}) {
    super(game);
    this.r = 22 * game.unit;
    this.maxHp = 18 * game.difficulty.hp;
    this.hp = this.maxHp;
    this.dir = opts.dir ?? (chance(0.5) ? 1 : -1);
    this.x = this.dir > 0 ? -this.r * 2 : game.w + this.r * 2;
    this.y = opts.y ?? rand(game.h * 0.34, game.h * 0.12);
    this.speed = 210 * game.unit;
    this.age = 0;
    this.baseScore = 1500;
    this.isUfo = true;
  }

  get score() {
    return Math.round(this.baseScore * this.game.scoreMult);
  }

  update(dt) {
    const g = this.game;
    this.age += dt;
    this.x += this.dir * this.speed * dt;
    this.y += Math.sin(this.age * 3) * 60 * g.unit * dt;
    this.flash = Math.max(0, this.flash - dt * 3.4);
    if ((this.dir > 0 && this.x > g.w + this.r * 3) || (this.dir < 0 && this.x < -this.r * 3)) {
      this.dead = true;
      this.escaped = true;
    }
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    g.fx.explosion(this.x, this.y, 1.4, '#8fe6ff');
    g.fx.shockwave(this.x, this.y, 90 * g.unit, 'rgba(140,230,255,0.9)', 0.5, 4);
    sfx.explosion(1.3);
    g.addScore(this.score, this.x, this.y);
    g.onEnemyKilled(this, source);
    g.spawnPickup(this.x, this.y, g.rollGift(true));
    for (let i = 0; i < 3; i++) {
      g.spawnPickup(this.x + rand(30, -30) * g.unit, this.y + rand(20, -20) * g.unit, 'food');
    }
  }

  draw(ctx, art, t) {
    art.draw(ctx, 'ufo', this.x, this.y, Math.sin(this.age * 2) * 0.12, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + Math.sin(t * 9) * 0.15;
    const g2 = ctx.createRadialGradient(this.x, this.y + this.r * 0.4, 0, this.x, this.y + this.r * 0.4, this.r * 1.6);
    g2.addColorStop(0, 'rgba(255,220,120,0.7)');
    g2.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(this.x, this.y + this.r * 0.4, this.r * 1.6, 0, TAU);
    ctx.fill();
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.7;
      art.draw(ctx, 'ufo', this.x, this.y, 0, 1);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------- boss -- */

const BOSS_NAMES = [
  'MOTHER HEN',
  'THE YOLK LORD',
  'COLONEL CLUCK',
  'IRON ROOSTER',
  'THE OMELETTE KING',
  'HENZILLA',
];

export class Boss extends Enemy {
  constructor(game, wave) {
    super(game);
    const tier = Math.floor(wave / 5);
    this.tier = tier;
    this.name = BOSS_NAMES[(tier - 1) % BOSS_NAMES.length] || BOSS_NAMES[0];
    this.isBoss = true;
    this.scale = 1 + Math.min(0.55, tier * 0.09);
    this.r = 58 * game.unit * this.scale;
    this.maxHp = Math.round((420 + wave * 130) * game.difficulty.bossHp);
    this.hp = this.maxHp;
    this.x = game.w * 0.5;
    this.y = -this.r * 1.4;
    this.homeY = game.h * 0.2 + this.r * 0.2;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.wobble = 0;
    this.state = 'enter';
    this.stateT = 0;
    this.attack = null;
    this.attackT = 0;
    this.attackStep = 0;
    this.cooldown = 1.6;
    this.baseScore = 6000 + wave * 700;
    this.phase = 1;
    this.canLay = false;
    this.hitRadiusScale = 0.78;
    this.deathT = 0;
  }

  get score() {
    return Math.round(this.baseScore * this.game.scoreMult);
  }

  get hpFrac() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  update(dt) {
    const g = this.game;
    const u = g.unit;
    this.age += dt;
    this.stateT += dt;
    this.wobble += dt * 6;
    this.flash = Math.max(0, this.flash - dt * 3.4);

    const wasPhase = this.phase;
    this.phase = this.hpFrac > 0.66 ? 1 : this.hpFrac > 0.33 ? 2 : 3;
    if (this.phase !== wasPhase) {
      sfx.bossRoar();
      g.shake(9);
      g.flash('rgba(255,120,60,0.35)');
      this.cooldown = 0.9;
      this.attack = null;
      g.fx.shockwave(this.x, this.y, 220 * u, 'rgba(255,180,120,0.9)', 0.7, 6);
    }

    if (this.state === 'enter') {
      this.y = lerp(this.y, this.homeY, 1 - Math.pow(0.06, dt));
      if (Math.abs(this.y - this.homeY) < 4 * u) {
        this.state = 'fight';
        this.stateT = 0;
        sfx.bossRoar();
        g.shake(8);
      }
      return;
    }

    if (this.state === 'dying') {
      this.deathT += dt;
      this.y += 24 * u * dt;
      this.x += Math.sin(this.deathT * 9) * 40 * u * dt;
      if (this.deathT % 0.18 < dt) {
        const a = rand(TAU);
        g.fx.explosion(
          this.x + Math.cos(a) * this.r * 0.7,
          this.y + Math.sin(a) * this.r * 0.7,
          1.1,
          '#ffb703'
        );
        sfx.explosion(1.1);
        g.shake(4);
      }
      if (this.deathT > 2.2) this.finishDeath();
      return;
    }

    /* --- idle drift ------------------------------------------------------ */
    if (!this.attack) {
      this.x = lerp(this.x, g.w * 0.5 + Math.sin(this.age * 0.8) * g.w * 0.28, 1 - Math.pow(0.4, dt));
      this.y = lerp(this.y, this.homeY + Math.sin(this.age * 1.3) * 12 * u, 1 - Math.pow(0.2, dt));
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.startAttack();
      return;
    }

    this.attackT += dt;
    this[`run_${this.attack}`](dt);
  }

  startAttack() {
    const pools = {
      1: ['volley', 'sweep', 'summon'],
      2: ['volley', 'ring', 'charge', 'summon', 'feathers'],
      3: ['ring', 'charge', 'volley', 'feathers', 'stomp', 'summon'],
    };
    const pool = pools[this.phase];
    let next = pick(pool);
    if (next === this.lastAttack) next = pick(pool);
    this.lastAttack = next;
    this.attack = next;
    this.attackT = 0;
    this.attackStep = 0;
  }

  endAttack(cooldown = 1.2) {
    this.attack = null;
    this.cooldown = cooldown / this.game.difficulty.bossRate;
  }

  /* --- attacks --------------------------------------------------------- */

  run_volley(dt) {
    const g = this.game;
    const step = 0.22;
    const shots = 4 + this.phase * 2;
    while (this.attackStep < shots && this.attackT > this.attackStep * step) {
      const p = g.player;
      const base = p && !p.dead ? angleTo(this.x, this.y, p.x, p.y) : Math.PI / 2;
      const spread = 0.34;
      const n = 3 + this.phase;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread * 0.5;
        g.spawnEgg(this.x, this.y + this.r * 0.5, {
          vx: Math.cos(a) * 220 * g.unit * g.difficulty.eggSpeed,
          vy: Math.sin(a) * 220 * g.unit * g.difficulty.eggSpeed,
          kind: 'egg',
        });
      }
      sfx.eggDrop();
      this.attackStep += 1;
    }
    this.x = lerp(this.x, g.w * 0.5, 1 - Math.pow(0.7, dt));
    if (this.attackStep >= shots && this.attackT > shots * step + 0.35) this.endAttack(1.25);
  }

  run_ring(dt) {
    const g = this.game;
    const bursts = 2 + this.phase;
    const step = 0.55;
    while (this.attackStep < bursts && this.attackT > this.attackStep * step) {
      const n = 10 + this.phase * 4;
      const off = this.attackStep * 0.18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + off;
        g.spawnEgg(this.x, this.y, {
          vx: Math.cos(a) * 190 * g.unit * g.difficulty.eggSpeed,
          vy: Math.sin(a) * 190 * g.unit * g.difficulty.eggSpeed,
          kind: 'egg',
        });
      }
      g.fx.shockwave(this.x, this.y, this.r * 2, 'rgba(255,230,180,0.8)', 0.4, 3);
      sfx.eggCrack();
      this.attackStep += 1;
    }
    if (this.attackStep >= bursts && this.attackT > bursts * step + 0.4) this.endAttack(1.4);
  }

  run_sweep(dt) {
    const g = this.game;
    const dur = 3.4;
    const t = this.attackT / dur;
    this.x = g.w * 0.5 + Math.sin(t * Math.PI * 2) * g.w * 0.36;
    this.y = lerp(this.y, this.homeY + 20 * g.unit, 1 - Math.pow(0.2, dt));
    const step = 0.16;
    while (this.attackStep * step < this.attackT && this.attackT < dur) {
      g.spawnEgg(this.x, this.y + this.r * 0.6, {
        vx: rand(40, -40) * g.unit,
        vy: 230 * g.unit * g.difficulty.eggSpeed,
        kind: chance(0.25) ? 'bigEgg' : 'egg',
      });
      this.attackStep += 1;
    }
    if (this.attackT > dur) this.endAttack(1.1);
  }

  run_charge(dt) {
    const g = this.game;
    const u = g.unit;
    if (this.attackStep === 0) {
      // Wind-up
      this.y = lerp(this.y, this.homeY - 16 * u, 1 - Math.pow(0.2, dt));
      if (this.attackT > 0.7) {
        this.attackStep = 1;
        const p = g.player;
        this.vx = (p && p.x < this.x ? -1 : 1) * 420 * u;
        this.vy = 210 * u;
        sfx.bossRoar();
      }
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < this.r * 0.7) {
      this.x = this.r * 0.7;
      this.vx *= -1;
      this.bounce();
    }
    if (this.x > g.w - this.r * 0.7) {
      this.x = g.w - this.r * 0.7;
      this.vx *= -1;
      this.bounce();
    }
    if (this.y > g.h * 0.56) {
      this.vy = -Math.abs(this.vy) * 0.9;
      this.bounce();
    }
    if (this.y < this.homeY - 30 * u) this.vy = Math.abs(this.vy);
    if (this.attackT > 4.2) {
      this.vx = 0;
      this.vy = 0;
      this.endAttack(1.3);
    }
  }

  bounce() {
    const g = this.game;
    g.shake(6);
    sfx.explosion(0.7);
    g.fx.shockwave(this.x, this.y, this.r * 1.6, 'rgba(255,255,255,0.6)', 0.35, 3);
    for (let i = 0; i < 3; i++) {
      const a = rand(TAU);
      g.spawnEgg(this.x, this.y, {
        vx: Math.cos(a) * 170 * g.unit,
        vy: Math.abs(Math.sin(a)) * 200 * g.unit,
        kind: 'egg',
      });
    }
  }

  run_stomp(dt) {
    const g = this.game;
    const u = g.unit;
    if (this.attackStep === 0) {
      const p = g.player;
      this.targetX = p ? p.x : g.w * 0.5;
      this.x = lerp(this.x, this.targetX, 1 - Math.pow(0.05, dt));
      if (this.attackT > 0.8) {
        this.attackStep = 1;
        this.attackT = 0;
      }
      return;
    }
    if (this.attackStep === 1) {
      this.y += 900 * u * dt;
      if (this.y > g.h * 0.7) {
        this.attackStep = 2;
        this.attackT = 0;
        g.shake(14);
        sfx.bigExplosion();
        vibrate(50);
        g.fx.shockwave(this.x, this.y, g.w * 0.9, 'rgba(255,200,120,0.9)', 0.7, 7);
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI + (i / (n - 1)) * Math.PI;
          g.spawnEgg(this.x, this.y, {
            vx: Math.cos(a) * 240 * u,
            vy: Math.sin(a) * 240 * u * 0.6,
            kind: 'egg',
          });
        }
      }
      return;
    }
    this.y = lerp(this.y, this.homeY, 1 - Math.pow(0.12, dt));
    if (this.attackT > 1.1) this.endAttack(1.5);
  }

  run_summon(dt) {
    const g = this.game;
    if (this.attackStep === 0 && this.attackT > 0.4) {
      const n = 3 + this.phase;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.5 + (i - (n - 1) / 2) * 0.5;
        g.addEnemy(
          new Chicken(g, {
            breed: 'chick',
            mode: 'chase',
            x: this.x + Math.cos(a) * this.r * 0.8,
            y: this.y + this.r * 0.5,
            canLay: false,
            speed: 90 + this.tier * 8,
          })
        );
      }
      sfx.cluck(1.6);
      g.fx.burst(this.x, this.y + this.r * 0.4, 12, { color: '#ffe066', speed: 160 });
      this.attackStep = 1;
    }
    this.y = lerp(this.y, this.homeY, 1 - Math.pow(0.2, dt));
    if (this.attackT > 1.4) this.endAttack(1.2);
  }

  run_feathers(dt) {
    const g = this.game;
    const dur = 2.6;
    const step = 0.1;
    while (this.attackStep * step < this.attackT && this.attackT < dur) {
      const a = Math.PI / 2 + Math.sin(this.attackStep * 0.7) * 1.1;
      g.spawnEgg(this.x, this.y + this.r * 0.3, {
        vx: Math.cos(a) * 260 * g.unit * g.difficulty.eggSpeed,
        vy: Math.sin(a) * 260 * g.unit * g.difficulty.eggSpeed,
        kind: 'feather',
      });
      this.attackStep += 1;
    }
    this.x = lerp(this.x, g.w * 0.5 + Math.sin(this.age) * g.w * 0.2, 1 - Math.pow(0.5, dt));
    if (this.attackT > dur) this.endAttack(1.0);
  }

  /* --- damage / death --------------------------------------------------- */

  hurt(dmg, source) {
    if (this.state === 'dying' || this.state === 'enter') return false;
    return super.hurt(dmg, source);
  }

  die() {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.deathT = 0;
    this.attack = null;
    this.hp = 0;
    const g = this.game;
    sfx.bigExplosion();
    g.shake(12);
    g.onBossDying(this);
  }

  finishDeath() {
    const g = this.game;
    this.dead = true;
    g.fx.explosion(this.x, this.y, 4.5, '#ffd166');
    g.fx.feathers(this.x, this.y, 40);
    g.fx.shockwave(this.x, this.y, g.w, 'rgba(255,240,200,0.95)', 0.9, 9);
    g.shake(18);
    g.flash('rgba(255,255,255,0.55)');
    sfx.bigExplosion();
    vibrate([60, 40, 120]);
    g.addScore(this.score, this.x, this.y);
    // Feast: a shower of drumsticks and gifts.
    for (let i = 0; i < 22; i++) {
      g.spawnPickup(this.x + rand(120, -120) * g.unit, this.y + rand(70, -70) * g.unit, 'food');
    }
    for (let i = 0; i < 3; i++) {
      g.spawnPickup(this.x + rand(90, -90) * g.unit, this.y + rand(40, -40) * g.unit, g.rollGift(true));
    }
    g.onEnemyKilled(this, null);
  }

  /** A crown marks the boss as royalty (and reads at a glance on a phone). */
  drawCrown(ctx) {
    const r = this.r;
    const cx = this.x + r * 0.28;
    const cy = this.y - r * 0.72;
    const w = r * 0.62;
    const h = r * 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(this.age * 1.4) * 0.06 - 0.12);
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, '#ffe9a8');
    g.addColorStop(1, '#e6a417');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.5);
    ctx.lineTo(-w * 0.5, -h * 0.4);
    ctx.lineTo(-w * 0.22, h * 0.02);
    ctx.lineTo(0, -h * 0.75);
    ctx.lineTo(w * 0.22, h * 0.02);
    ctx.lineTo(w * 0.5, -h * 0.4);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,10,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.stroke();
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(0, h * 0.16, h * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  draw(ctx, art, t) {
    const u = this.game.unit;
    const frame = Math.floor(this.wobble) % 3;
    const squash = this.state === 'dying' ? 1 + Math.sin(this.deathT * 22) * 0.06 : 1;
    ctx.save();
    if (this.state === 'dying') {
      ctx.globalAlpha = 0.85 + Math.sin(this.deathT * 30) * 0.15;
    }
    // Angry aura in the final phase.
    if (this.phase === 3 && this.state === 'fight') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(this.x, this.y, this.r * 0.6, this.x, this.y, this.r * 1.5);
      g2.addColorStop(0, 'rgba(255,80,60,0.35)');
      g2.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    art.draw(ctx, 'chicken_boss', this.x, this.y, Math.sin(this.age * 1.4) * 0.06, this.scale * squash, 1, frame);
    this.drawCrown(ctx);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash * 0.6;
      art.draw(ctx, 'chicken_boss', this.x, this.y, 0, this.scale * squash, 1, frame);
    }
    ctx.restore();
  }
}
