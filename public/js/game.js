/*
 * Game core: fixed-ish timestep loop, state machine, spawning, collisions and
 * rendering order. The DOM shell (menus, buttons) talks to this through the
 * small callback surface at the bottom of the class.
 */

import { TAU, rand, chance, clamp, lerp, angleTo, dist, pick, Pool, cachedGradient, clearGradientCache } from './util.js';
import { Art, Starfield } from './art.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Chicken, Ufo } from './enemies.js';
import { Wave, Formation, difficultyFor, difficultyMode } from './waves.js';
import { WEAPONS, drawBullet, drawMissile, drawEnemyShot, nearestEnemy } from './weapons.js';
import { sfx, music, vibrate, unlock as unlockAudio } from './audio.js';
import { settings, submitScore, highScore, saveRun, loadRun, clearRun } from './storage.js';
import { drawHud, drawBanner, drawBossBar } from './hud.js';
import {
  POWERUPS, isPowerup, MAGNET_RANGE, WARP_FACTOR, NUKE_DAMAGE, NUKE_DAMAGE_PER_WAVE,
} from './powerups.js';

const GIFTS = ['weapon', 'power', 'missile', 'shield', 'life'];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.art = new Art();
    this.stars = new Starfield();
    this.fx = new Effects(this);
    this.input = new Input(canvas);
    this.formation = new Formation(this);

    this.w = 400;
    this.h = 700;
    this.viewW = 400;
    this.offsetX = 0;
    this.unit = 1;
    this.insetBottom = 20;
    this.insetTop = 10;
    this.score = 0;
    this.waveNum = 0;
    this.scoreMult = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.stats = { kills: 0, shots: 0, hits: 0, food: 0, waves: 0, missilesFired: 0 };
    this.pointerIsMouse = window.matchMedia('(pointer: fine)').matches;

    this.state = 'boot';
    this.time = 0;
    this.timeScale = 1;
    this.shakeAmount = 0;
    this.flashColor = null;
    this.flashAlpha = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsCount = 0;

    this.enemies = { active: [], forEach(fn) { const a = this.active; for (let i = 0; i < a.length; i++) fn(a[i], i); }, get length() { return this.active.length; } };
    this.pickups = [];
    this.missiles = [];
    this.arcs = [];
    this.nextId = 1;

    this.bullets = new Pool(
      () => ({}),
      (b, o) => {
        b.x = o.x;
        b.y = o.y;
        b.angle = o.angle;
        b.speed = o.speed * this.unit;
        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
        b.r = o.r * this.unit;
        b.dmg = o.dmg;
        b.kind = o.kind;
        b.color = o.color;
        b.pierce = o.pierce || 0;
        b.chain = o.chain || 0;
        b.splash = (o.splash || 0) * this.unit;
        b.len = o.len || 0;
        b.spin = o.spin || 0;
        b.rot = o.rot || 0;
        b.life = 0;
        b.maxLife = o.maxLife || 3;
        b.unit = this.unit;
        b.seed = rand(TAU);
        b.hitId = -1;
      }
    );

    this.enemyShots = new Pool(
      () => ({}),
      (e, o) => {
        e.x = o.x;
        e.y = o.y;
        e.vx = o.vx;
        e.vy = o.vy;
        e.kind = o.kind || 'egg';
        e.r = (e.kind === 'bigEgg' ? 11 : e.kind === 'orb' ? 10 : e.kind === 'feather' ? 8 : 6.5) * this.unit;
        e.rot = o.rot || 0;
        e.spin = o.spin ?? (e.kind === 'feather' ? rand(6, -6) : rand(2.4, -2.4));
        e.scale = e.kind === 'feather' ? 1.4 : 1;
        e.seed = rand(TAU);
        e.life = 0;
      }
    );

    this.player = null;
    this.boss = null;
    this.wave = null;
    this.mode = difficultyMode(settings.get('difficulty'));
    this.difficulty = difficultyFor(1, this.mode);

    // Players who ask for less motion get no shake, no flashes, no slow-mo.
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = motionQuery.matches;
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches;
      });
    }

    this.hooks = {};
    this.input.onPause = () => this.togglePause();
    this.input.onMissile = () => this.player && this.player.fireMissile();
    this._raf = null;
    this._last = 0;
  }

  on(name, fn) {
    this.hooks[name] = fn;
  }

  emit(name, ...args) {
    if (this.hooks[name]) this.hooks[name](...args);
  }

  /* ------------------------------------------------------------- lifecycle -- */

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const viewW = Math.max(240, Math.round(rect.width));
    const viewH = Math.max(320, Math.round(rect.height));

    this.canvas.width = Math.round(viewW * dpr);
    this.canvas.height = Math.round(viewH * dpr);
    this.canvas.logicalWidth = viewW;
    this.canvas.logicalHeight = viewH;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // On wide screens (landscape phones, tablets, desktop) the playfield is a
    // centred portrait strip; the leftovers become decorative gutters.
    const w = Math.min(viewW, Math.round(viewH * 0.8));
    const h = viewH;
    this.viewW = viewW;
    this.offsetX = Math.round((viewW - w) / 2);
    this.canvas.playOffsetX = this.offsetX;
    // The DOM HUD buttons hug the playfield, not the screen edge.
    document.documentElement.style.setProperty('--gutter', `${this.offsetX}px`);

    this.w = w;
    this.h = h;
    this.dpr = dpr;
    // One "unit" ≈ one pixel on a 420x760 reference phone.
    this.unit = clamp(Math.min(w / 420, h / 760), 0.62, 2.4);

    // Safe-area insets are measured by a DOM probe in main.js.
    this.insetBottom = 26 * this.unit + (this.safeBottom || 0);
    this.insetTop = 6 * this.unit + (this.safeTop || 0);

    clearGradientCache();
    this.art.build(this.unit, dpr);
    this.stars.init(w, h, this.unit);
    this.formation.resize();
    if (this.player) {
      this.player.r = 15 * this.unit;
      this.player.x = clamp(this.player.x, this.player.r, w - this.player.r);
      this.player.y = clamp(this.player.y, h * 0.32, h - this.player.r - this.insetBottom);
    }
  }

  startLoop() {
    if (this._raf) return;
    this._last = performance.now();
    const step = (ts) => {
      this._raf = requestAnimationFrame(step);
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.05) dt = 0.05; // clamp after tab switches / GC hitches
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(step);
  }

  stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /** Menu background: chickens drifting past, no player, no danger. */
  startAttract() {
    this.state = 'attract';
    this.input.enabled = false;
    this.reset();
    this.attractTimer = 0;
    this.startLoop();
  }

  reset() {
    this.bullets.clear();
    this.enemyShots.clear();
    this.enemies.active.length = 0;
    this.pickups.length = 0;
    this.missiles.length = 0;
    this.arcs.length = 0;
    this.fx.clear();
    this.boss = null;
    this.wave = null;
    this.shakeAmount = 0;
    this.flashAlpha = 0;
    this.timeScale = 1;
  }

  /**
   * Start a run. Pass a snapshot from `loadRun()` to continue where the player
   * left off; otherwise everything starts from wave 1.
   */
  newGame(resume = null) {
    unlockAudio();
    this.reset();
    this.mode = difficultyMode(resume ? resume.difficulty : settings.get('difficulty'));
    this.score = resume ? resume.score : 0;
    this.waveNum = resume ? resume.wave - 1 : 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.scoreMult = 1;
    this.stats = resume
      ? { kills: 0, shots: 0, hits: 0, food: 0, waves: 0, missilesFired: 0, ...(resume.stats || {}) }
      : { kills: 0, shots: 0, hits: 0, food: 0, waves: 0, missilesFired: 0 };
    this.player = new Player(this);
    this.player.reset(true);
    if (resume) this.player.restore(resume);
    this.input.enabled = true;
    this.input.reset();
    this.ufoTimer = rand(34, 18);
    this.state = 'playing';
    this.startLoop();
    this.nextWave();
    music.start('space');
    this.emit('hud', this.snapshot());
  }

  /** Snapshot of the run, written at every wave boundary. */
  autosave() {
    const p = this.player;
    if (!p || this.state === 'gameover') return;
    saveRun({
      difficulty: this.mode.id,
      wave: this.waveNum,
      score: Math.floor(this.score),
      lives: p.lives,
      weapon: p.weapon.id,
      level: p.level,
      missiles: p.missiles,
      food: p.food,
      stats: this.stats,
    });
  }

  hasSavedRun() {
    return loadRun();
  }

  quitToMenu() {
    this.input.enabled = false;
    music.stop(0.4);
    this.player = null;
    this.startAttract();
  }

  /* ----------------------------------------------------------------- waves -- */

  nextWave() {
    this.waveNum += 1;
    this.difficulty = difficultyFor(this.waveNum, this.mode);
    this.wave = new Wave(this, this.waveNum);
    this.state = 'wave-intro';
    this.stateTimer = this.wave.isBoss ? 2.4 : 1.5;
    this.banner = {
      title: this.wave.isBoss ? 'WARNING' : this.wave.isFeast ? 'FEAST TIME' : `WAVE ${this.waveNum}`,
      sub: this.wave.isBoss
        ? 'BOSS APPROACHING'
        : this.wave.isFeast
          ? 'GRAB THE GRUB'
          : this.wave.label,
      color: this.wave.isBoss ? '#ff6b6b' : this.wave.isFeast ? '#ffd166' : '#8ef1ff',
      t: 0,
    };
    if (this.wave.isBoss) {
      sfx.bossWarn();
      music.setMode('boss');
      vibrate([30, 60, 30]);
    } else {
      music.setMode('space');
      if (this.wave.isFeast) sfx.waveClear();
    }
    this.autosave();
    this.emit('hud', this.snapshot());
  }

  completeWave() {
    this.state = 'wave-clear';
    this.stateTimer = 2.6;
    this.stats.waves += 1;
    const acc = this.stats.shots ? this.stats.hits / this.stats.shots : 0;
    const waveBonus = 500 * this.waveNum;
    const accBonus = Math.round(acc * 1500);
    const lifeBonus = this.player.lives * 250;
    this.waveResult = { waveBonus, accBonus, lifeBonus, acc };
    this.addScore(waveBonus + accBonus + lifeBonus);
    this.banner = {
      title: 'WAVE CLEARED',
      sub: `+${waveBonus + accBonus + lifeBonus} BONUS`,
      color: '#69db7c',
      t: 0,
    };
    // Fresh accuracy window per wave.
    this.stats.shots = 0;
    this.stats.hits = 0;
    // Nothing edible goes to waste: leftover pickups home in on the ship.
    for (const k of this.pickups) {
      k.homing = true;
      k.maxLife = Math.max(k.maxLife, k.life + 4);
    }
    sfx.waveClear();
    music.setMode('space');
    this.emit('hud', this.snapshot());
  }

  /* ------------------------------------------------------------ spawn utils -- */

  addEnemy(e) {
    e.id = this.nextId++;
    this.enemies.active.push(e);
    return e;
  }

  spawnBullet(opts) {
    this.stats.shots += 1;
    return this.bullets.spawn(opts);
  }

  spawnEgg(x, y, opts) {
    return this.enemyShots.spawn({ x, y, ...opts });
  }

  spawnMissile(x, y) {
    this.stats.missilesFired += 1;
    this.missiles.push({
      x,
      y,
      angle: -Math.PI / 2,
      speed: 380 * this.unit,
      r: 9 * this.unit,
      dmg: 90,
      splash: 110 * this.unit,
      life: 0,
      target: null,
      scale: 1,
    });
  }

  /**
   * Weighted gift table. Permanent upgrades stay the most common; the timed
   * power-ups fill the rest, with the screen-clearing nuke as the rare prize.
   */
  rollGift(favourWeapon = false) {
    if (favourWeapon && chance(0.5)) return 'weapon';
    const r = Math.random();
    if (r < 0.26) return 'weapon';
    if (r < 0.42) return 'power';
    if (r < 0.53) return 'missile';
    if (r < 0.61) return 'shield';
    if (r < 0.65) return 'life';
    if (r < 0.73) return 'drones';
    if (r < 0.81) return 'overdrive';
    if (r < 0.87) return 'magnet';
    if (r < 0.93) return 'double';
    if (r < 0.97) return 'warp';
    return 'nuke';
  }

  spawnPickup(x, y, type) {
    const u = this.unit;
    const isFood = type === 'food';
    const weaponId = type === 'weapon' ? pick(WEAPONS).id : null;
    this.pickups.push({
      x,
      y,
      vx: rand(50, -50) * u,
      vy: rand(40, -10) * u,
      r: (isFood ? 13 : 15) * u,
      type,
      weaponId,
      rot: rand(0.4, -0.4),
      spin: rand(1.6, -1.6),
      life: 0,
      maxLife: 14,
      homing: false,
    });
  }

  /* ------------------------------------------------------------------ frame -- */

  frame(dtRaw) {
    const dt = dtRaw * this.timeScale;
    this.time += dtRaw;
    this._fpsAcc += dtRaw;
    this._fpsCount += 1;
    if (this._fpsAcc > 0.5) {
      this.fps = this._fpsCount / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsCount = 0;
    }

    this.input.poll();

    switch (this.state) {
      case 'attract':
        this.updateAttract(dtRaw);
        break;
      case 'paused':
        this.stars.update(dtRaw * 0.15);
        break;
      case 'countdown': {
        // Frozen world with a 3-2-1 so nobody resumes straight into an egg.
        this.stars.update(dtRaw * 0.4);
        this.stateTimer -= dtRaw;
        if (this.stateTimer <= 0) {
          this.state = this._resumeState || 'playing';
          this.banner = null;
          this.input.reset();
          break;
        }
        // One banner per number, so each digit pops in.
        const n = Math.ceil(this.stateTimer);
        if (n !== this._countdownAt) {
          this._countdownAt = n;
          sfx.countdown(n);
          this.banner = { title: String(n), sub: 'GET READY', color: '#8ef1ff', t: 0 };
        }
        break;
      }
      case 'gameover':
        this.updateWorld(dt, false);
        break;
      case 'wave-intro':
        this.stateTimer -= dtRaw;
        this.updateWorld(dt, true);
        if (this.stateTimer <= 0) {
          this.state = 'playing';
          this.banner = null;
        }
        break;
      case 'wave-clear':
        this.stateTimer -= dtRaw;
        this.updateWorld(dt, true);
        if (this.stateTimer <= 0) {
          this.banner = null;
          this.nextWave();
        }
        break;
      case 'life-lost':
        this.stateTimer -= dtRaw;
        this.updateWorld(dt, false);
        this.timeScale = lerp(this.timeScale, 1, dtRaw * 2);
        if (this.stateTimer <= 0) this.afterLifeLost();
        break;
      case 'playing':
        this.updateWorld(dt, true);
        break;
    }

    this.render();
    this.input.endFrame();
  }

  updateAttract(dt) {
    this.stars.update(dt);
    this.formation.update(dt);
    this.attractTimer -= dt;
    if (this.attractTimer <= 0) {
      this.attractTimer = rand(1.6, 0.5);
      const fromLeft = chance(0.5);
      if (chance(0.35)) {
        this.addEnemy(
          new Chicken(this, {
            breed: pick(['white', 'white', 'brown', 'chick']),
            mode: 'fall',
            x: rand(this.w * 0.9, this.w * 0.1),
            y: -40 * this.unit,
            speed: rand(70, 35),
            sway: rand(50, 15),
            canLay: false,
          })
        );
      } else {
        this.addEnemy(
          new Chicken(this, {
            breed: pick(['white', 'brown', 'metal']),
            mode: 'sine',
            x: fromLeft ? -40 * this.unit : this.w + 40 * this.unit,
            y: rand(this.h * 0.75, this.h * 0.1),
            dir: fromLeft ? 1 : -1,
            speed: rand(140, 70),
            amp: rand(50, 15),
            canLay: false,
          })
        );
      }
    }
    const list = this.enemies.active;
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].update(dt);
      if (list[i].dead) list.splice(i, 1);
    }
    this.fx.update(dt);
  }

  updateWorld(dt, live) {
    const p = this.player;
    // Time warp slows everything hostile — enemies, their shots and the
    // formation drift — while the ship and its bullets stay at full speed.
    const warped = p && !p.dead && p.hasBuff('warp');
    const edt = warped ? dt * WARP_FACTOR : dt;
    this.stars.update(dt, this.state === 'playing' ? 1 : 0.6);
    this.formation.update(edt);
    this.shakeAmount *= Math.pow(0.0015, dt);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.2);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.scoreMult = 1;
      }
    }

    if (live && this.wave) this.wave.update(edt);

    if (p && !p.dead) p.update(dt, this.input);

    /* --- enemies ---------------------------------------------------------- */
    const list = this.enemies.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.update(edt);
      if (e.dead) {
        if (e === this.boss) this.boss = null;
        list.splice(i, 1);
      }
    }

    this.updateBullets(dt);
    this.updateMissiles(dt);
    this.updateEnemyShots(edt);
    this.updatePickups(dt);

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }

    this.fx.update(dt);

    /* --- ship vs enemies -------------------------------------------------- */
    if (live && p && !p.dead && p.invuln <= 0) {
      for (const e of list) {
        if (e.entering && e.mode === 'slot') continue;
        const rr = p.r * 0.62 + e.r * (e.hitRadiusScale || 0.8);
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          if (e.isBoss) {
            this.killPlayer();
          } else {
            const survived = !p.takeHit();
            if (!e.isAsteroid || !survived) e.hurt(9999, 'ram');
            if (!survived) this.killPlayer();
          }
          break;
        }
      }
    }

    /* --- UFO bonus -------------------------------------------------------- */
    if (live && this.state === 'playing' && !this.wave.isBoss && !this.wave.isFeast) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) {
        this.ufoTimer = rand(46, 26);
        this.addEnemy(new Ufo(this));
        sfx.pickup();
      }
    }

    /* --- wave completion -------------------------------------------------- */
    if (this.state === 'playing' && this.wave && this.wave.done && list.length === 0) {
      this.completeWave();
    }
  }

  /* --------------------------------------------------------------- bullets -- */

  updateBullets(dt) {
    const list = this.enemies.active;
    this.bullets.forEach((b) => {
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      if (b.life > b.maxLife || b.y < -40 || b.x < -60 || b.x > this.w + 60 || b.y > this.h + 40) {
        b.dead = true;
        return;
      }
      if (b.kind === 'positron' || b.kind === 'rail') {
        if (chance(0.5)) this.fx.trail(b.x, b.y + b.r, b.color, 1.6);
      }

      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead || e.id === b.hitId) continue;
        if (e.entering && e.mode === 'slot' && e.y < 0) continue;
        const rr = b.r + e.r * (e.hitRadiusScale || 0.86);
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 > rr * rr) continue;

        this.stats.hits += 1;
        this.fx.burst(b.x, b.y, 3, { speed: 90, size: 2.6, life: 0.22, color: b.color });
        const killed = e.hurt(b.dmg, 'bullet');

        if (b.splash) this.splashDamage(b.x, b.y, b.splash, b.dmg * 0.55, e);
        if (b.chain) this.chainLightning(e, b.chain, b.dmg * 0.7);
        if (b.splash) {
          this.fx.explosion(b.x, b.y, 0.7, b.color);
          this.fx.shockwave(b.x, b.y, b.splash, 'rgba(255,140,120,0.8)', 0.3, 3);
        }

        if (b.pierce > 0) {
          b.pierce -= 1;
          b.hitId = e.id;
        } else {
          b.dead = true;
        }
        if (!killed) this.shake(0.5);
        break;
      }
    });
    this.bullets.sweep();
  }

  splashDamage(x, y, radius, dmg, exclude) {
    this.enemies.forEach((e) => {
      if (e.dead || e === exclude) return;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < radius * radius) e.hurt(dmg, 'splash');
    });
  }

  chainLightning(from, jumps, dmg) {
    let src = from;
    const seen = new Set([from.id]);
    for (let j = 0; j < jumps; j++) {
      let best = null;
      let bestD = (150 * this.unit) ** 2;
      this.enemies.forEach((e) => {
        if (e.dead || seen.has(e.id)) return;
        const d = (e.x - src.x) ** 2 + (e.y - src.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      });
      if (!best) break;
      this.arcs.push({ x1: src.x, y1: src.y, x2: best.x, y2: best.y, life: 0.18, maxLife: 0.18 });
      best.hurt(dmg, 'chain');
      seen.add(best.id);
      src = best;
    }
  }

  /* -------------------------------------------------------------- missiles -- */

  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life += dt;
      if (!m.target || m.target.dead) m.target = nearestEnemy(this, m.x, m.y, 520 * this.unit);
      if (m.target) {
        const want = angleTo(m.x, m.y, m.target.x, m.target.y);
        let d = want - m.angle;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        m.angle += clamp(d, -3.4 * dt, 3.4 * dt);
      }
      m.speed = Math.min(m.speed + 620 * this.unit * dt, 900 * this.unit);
      m.x += Math.cos(m.angle) * m.speed * dt;
      m.y += Math.sin(m.angle) * m.speed * dt;
      this.fx.trail(m.x, m.y, 'rgba(255,190,120,0.8)', 2.6);

      let boom = m.y < -30 || m.x < -40 || m.x > this.w + 40 || m.life > 6;
      if (!boom) {
        for (const e of this.enemies.active) {
          if (e.dead) continue;
          const rr = m.r + e.r * (e.hitRadiusScale || 0.9);
          if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 < rr * rr) {
            this.stats.hits += 1;
            e.hurt(m.dmg, 'missile');
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        this.splashDamage(m.x, m.y, m.splash, m.dmg * 0.8, null);
        this.fx.explosion(m.x, m.y, 1.8, '#ffa94d');
        this.fx.shockwave(m.x, m.y, m.splash * 1.1, 'rgba(255,200,140,0.9)', 0.45, 5);
        sfx.explosion(1.5);
        this.shake(7);
        this.missiles.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------ enemy fire -- */

  updateEnemyShots(dt) {
    const p = this.player;
    this.enemyShots.forEach((e) => {
      e.life += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 90 * this.unit * dt * (e.kind === 'feather' ? 0.15 : 0.55);
      e.rot += e.spin * dt;

      if (e.y > this.h - 2 * this.unit) {
        // Splat on the floor.
        this.fx.splat(e.x, this.h - 2 * this.unit, e.kind === 'feather' ? '#ffffff' : '#fff8e1');
        if (e.kind !== 'feather') sfx.eggCrack();
        e.dead = true;
        return;
      }
      if (e.x < -40 || e.x > this.w + 40 || e.life > 12) {
        e.dead = true;
        return;
      }

      if (p && !p.dead && p.invuln <= 0) {
        const rr = e.r * 0.8 + p.r * 0.6;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          e.dead = true;
          this.fx.splat(e.x, e.y, '#fff8e1');
          sfx.eggCrack();
          if (p.takeHit()) this.killPlayer();
        }
      }
    });
    this.enemyShots.sweep();
  }

  /* --------------------------------------------------------------- pickups -- */

  updatePickups(dt) {
    const p = this.player;
    const u = this.unit;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life += dt;
      k.vy += 210 * u * dt;
      k.vy = Math.min(k.vy, 210 * u);
      k.vx *= Math.pow(0.5, dt * 1.4);

      // Gentle magnetism so drumsticks feel collectable on a small screen.
      if (p && !p.dead) {
        const d = dist(k.x, k.y, p.x, p.y);
        const magnet = p.hasBuff('magnet');
        const range = k.homing ? Infinity : (magnet ? MAGNET_RANGE : 110) * u;
        if (d < range) {
          const a = angleTo(k.x, k.y, p.x, p.y);
          const pull = k.homing || magnet ? 900 * u * dt : (1 - d / range) * 620 * u * dt;
          k.vx += Math.cos(a) * pull;
          k.vy += Math.sin(a) * pull;
        }
      }

      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.rot += k.spin * dt;
      if (k.x < k.r) {
        k.x = k.r;
        k.vx = Math.abs(k.vx) * 0.6;
      }
      if (k.x > this.w - k.r) {
        k.x = this.w - k.r;
        k.vx = -Math.abs(k.vx) * 0.6;
      }

      if (k.y > this.h + k.r * 2 || k.life > k.maxLife) {
        this.pickups.splice(i, 1);
        continue;
      }

      if (p && !p.dead) {
        const rr = k.r + p.r * 0.95;
        if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 < rr * rr) {
          this.collect(k);
          this.pickups.splice(i, 1);
        }
      }
    }
  }

  collect(k) {
    const p = this.player;
    switch (k.type) {
      case 'food':
        p.addFood(1);
        this.stats.food += 1;
        this.addScore(50);
        sfx.food();
        this.fx.burst(k.x, k.y, 5, { speed: 110, size: 2.4, life: 0.3, color: ['#ffd166', '#fff3bf'] });
        break;
      case 'weapon':
        p.addWeapon(k.weaponId);
        break;
      case 'power':
        p.addPower();
        break;
      case 'missile':
        p.addMissiles(3);
        break;
      case 'shield':
        p.addShield(12);
        break;
      case 'life':
        p.addLife();
        break;
      case 'nuke':
        this.detonateNuke();
        break;
      default:
        if (isPowerup(k.type)) p.addBuff(k.type);
    }
    this.emit('hud', this.snapshot());
  }

  /* ------------------------------------------------------------ score/juice -- */

  addScore(n, x, y) {
    const p = this.player;
    if (p && p.hasBuff('double')) n *= 2;
    n = Math.round(n * this.mode.scoreMul);
    this.score += n;
    if (x != null && n >= 100) this.fx.text(`+${n}`, x, y, '#ffe066', 12, 0.75);
    this.emit('hud', this.snapshot());
  }

  onEnemyKilled(enemy, source) {
    this.stats.kills += 1;
    this.combo += 1;
    this.comboTimer = 2.2;
    this.scoreMult = 1 + Math.min(4, Math.floor(this.combo / 12) * 0.5);
    this.shake(enemy.isBoss ? 10 : enemy.isUfo ? 5 : 1.4);
    if (this.boss === enemy) this.boss = null;
  }

  onBossDying() {
    // Clear incoming fire so the victory moment is safe.
    this.enemyShots.forEach((e) => {
      e.dead = true;
    });
    this.enemyShots.sweep();
    if (!this.prefersReducedMotion) {
      this.timeScale = 0.55;
      setTimeout(() => {
        this.timeScale = 1;
      }, 700);
    }
  }

  /** Instant power-up: scours the screen and wipes incoming fire. */
  detonateNuke() {
    const dmg = NUKE_DAMAGE + this.waveNum * NUKE_DAMAGE_PER_WAVE;
    const cx = this.w * 0.5;
    const cy = this.h * 0.45;
    sfx.nuke();
    this.flash('rgba(255,240,220,0.9)');
    this.shake(16);
    vibrate([40, 30, 80]);
    this.fx.shockwave(cx, cy, Math.max(this.w, this.h), 'rgba(255,230,180,0.95)', 0.8, 8);
    this.fx.shockwave(cx, cy, Math.max(this.w, this.h) * 0.6, 'rgba(255,140,120,0.9)', 0.55, 6);

    // Every egg in flight is scrambled.
    this.enemyShots.forEach((e) => {
      this.fx.splat(e.x, e.y, '#fff8e1');
      e.dead = true;
    });
    this.enemyShots.sweep();

    // Damage everything on screen, bosses included (they take a fraction).
    const targets = this.enemies.active.slice();
    for (const e of targets) {
      if (e.y < -e.r) continue;
      this.fx.explosion(e.x, e.y, 0.6, '#ffd8a8');
      e.hurt(e.isBoss ? dmg * 0.55 : dmg, 'nuke');
    }
    this.emit('hud', this.snapshot());
  }

  shake(amount) {
    if (this.prefersReducedMotion || !settings.get('shake')) return;
    this.shakeAmount = Math.min(26, this.shakeAmount + amount);
  }

  flash(color) {
    this.flashColor = color;
    this.flashAlpha = this.prefersReducedMotion ? 0.2 : 0.55;
  }

  floatText(text, x, y, color) {
    this.fx.text(text, x, y, color, 13, 1.1);
  }

  /* ------------------------------------------------------------------ death -- */

  /** Apply one hit to the ship, handling shields and the death sequence. */
  damagePlayer() {
    const p = this.player;
    if (!p || p.dead) return false;
    if (p.takeHit()) {
      this.killPlayer();
      return true;
    }
    return false;
  }

  killPlayer() {
    const p = this.player;
    this.fx.explosion(p.x, p.y, 2.4, '#ff8787');
    this.fx.burst(p.x, p.y, 18, { speed: 260, size: 4, life: 0.9, color: ['#8ef1ff', '#ffffff', '#ff8787'] });
    this.fx.shockwave(p.x, p.y, 140 * this.unit, 'rgba(255,180,180,0.9)', 0.6, 5);
    this.shake(14);
    this.flash('rgba(255,80,80,0.45)');
    this.timeScale = this.prefersReducedMotion ? 1 : 0.4;
    this.state = 'life-lost';
    this.stateTimer = 1.5;
    this.combo = 0;
    this.scoreMult = 1;
    this.emit('hud', this.snapshot());
  }

  afterLifeLost() {
    this.timeScale = 1;
    const p = this.player;
    if (p.lives <= 0) {
      this.gameOver();
      return;
    }
    // Sweep the screen so the player doesn't respawn into a wall of eggs.
    this.enemyShots.forEach((e) => {
      if (e.y > this.h * 0.45) e.dead = true;
    });
    this.enemyShots.sweep();
    p.respawn();
    this.state = 'playing';
    this.emit('hud', this.snapshot());
  }

  gameOver() {
    this.state = 'gameover';
    this.input.enabled = false;
    music.stop(0.8);
    sfx.gameOver();
    clearRun();
    const rank = submitScore(this.score, this.waveNum, {
      difficulty: this.mode.id,
      kills: this.stats.kills,
      food: this.stats.food,
    });
    this.emit('gameover', {
      score: this.score,
      wave: this.waveNum,
      rank,
      best: highScore(),
      difficulty: this.mode,
      stats: { ...this.stats },
    });
  }

  togglePause(force) {
    const pausable = ['playing', 'wave-intro', 'wave-clear', 'countdown'];
    if (pausable.includes(this.state)) {
      if (this.state !== 'countdown') this._resumeState = this.state;
      this.state = 'paused';
      this.banner = null;
      this.input.reset();
      music.duck(true);
      this.emit('pause', true);
    } else if (this.state === 'paused' && force !== true) {
      this.state = 'countdown';
      this.stateTimer = 3;
      this._countdownAt = null;
      this.input.reset();
      music.duck(false);
      sfx.countdown(3);
      this.emit('pause', false);
    }
  }

  snapshot() {
    const p = this.player;
    return {
      score: this.score || 0,
      wave: this.waveNum || 0,
      lives: p ? p.lives : 0,
      missiles: p ? p.missiles : 0,
      food: p ? p.food : 0,
      weapon: p ? p.weapon : WEAPONS[0],
      level: p ? p.level : 0,
      mult: this.scoreMult || 1,
      difficulty: this.mode.id,
    };
  }

  /* ----------------------------------------------------------------- render -- */

  render() {
    const ctx = this.ctx;
    const { w, h } = this;

    ctx.save();
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.viewW || w, h);

    // Everything below is drawn in playfield space.
    ctx.translate(this.offsetX || 0, 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    if (this.shakeAmount > 0.15) {
      const s = this.shakeAmount * this.unit * 0.4;
      ctx.translate(rand(s, -s), rand(s, -s));
    }

    this.stars.draw(ctx);

    // Pickups sit under everything else.
    for (const k of this.pickups) this.drawPickup(ctx, k);

    this.enemies.forEach((e) => e.draw(ctx, this.art, this.time));

    // Lightning arcs
    if (this.arcs.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#a5d8ff';
      ctx.shadowColor = '#a5d8ff';
      ctx.shadowBlur = 8 * this.unit;
      for (const a of this.arcs) {
        ctx.globalAlpha = a.life / a.maxLife;
        ctx.lineWidth = 2.4 * this.unit;
        ctx.beginPath();
        ctx.moveTo(a.x1, a.y1);
        const segs = 4;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const jitter = i === segs ? 0 : rand(10, -10) * this.unit;
          ctx.lineTo(lerp(a.x1, a.x2, t) + jitter, lerp(a.y1, a.y2, t) + jitter);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    this.enemyShots.forEach((e) => drawEnemyShot(ctx, e, this.art, this.time));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.bullets.forEach((b) => drawBullet(ctx, b, this.time));
    ctx.restore();

    for (const m of this.missiles) drawMissile(ctx, m, this.art);

    if (this.player) this.player.draw(ctx, this.art, this.time);

    this.fx.draw(ctx, this.art);

    ctx.restore();

    // Screen flash
    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha * 0.7;
      ctx.fillStyle = this.flashColor || '#fff';
      ctx.fillRect(0, 0, this.viewW || w, h);
      ctx.restore();
    }

    // Gutter edges on wide screens.
    if (this.offsetX > 0) {
      ctx.save();
      ctx.translate(this.offsetX, 0);
      for (const side of [-1, 1]) {
        const x = side < 0 ? 0 : w;
        const g = ctx.createLinearGradient(x, 0, x + side * 26 * this.unit, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.75)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(x, x + side * 26 * this.unit), 0, 26 * this.unit, h);
      }
      ctx.strokeStyle = 'rgba(140,180,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0.5, 0);
      ctx.lineTo(0.5, h);
      ctx.moveTo(w - 0.5, 0);
      ctx.lineTo(w - 0.5, h);
      ctx.stroke();
      ctx.restore();
    }

    if (this.state !== 'attract') {
      ctx.save();
      ctx.translate(this.offsetX || 0, 0);
      drawHud(ctx, this);
      if (this.boss && this.boss.state !== 'enter') drawBossBar(ctx, this, this.boss);
      if (this.banner) drawBanner(ctx, this, this.banner);
      ctx.restore();
    }

    if (settings.get('showFps')) {
      ctx.save();
      ctx.font = `600 ${Math.round(11 * this.unit)}px ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText(`${this.fps.toFixed(0)} fps`, (this.viewW || w) - 8, h - 8 - this.insetBottom * 0.2);
      ctx.restore();
    }
  }

  drawPickup(ctx, k) {
    const art = this.art;
    const bob = Math.sin(this.time * 6 + k.x * 0.05) * 2 * this.unit;
    const fade = k.life > k.maxLife - 3 ? 0.35 + 0.65 * Math.abs(Math.sin(this.time * 12)) : 1;
    const STATIC_KEYS = {
      food: 'drumstick',
      weapon: 'giftWeapon',
      power: 'giftPower',
      missile: 'giftMissile',
      shield: 'giftShield',
      life: 'giftLife',
    };
    const key = STATIC_KEYS[k.type] || `gift_${k.type}`;

    ctx.save();
    ctx.globalAlpha = fade;
    // Glow so pickups read against the starfield.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const STATIC_GLOW = {
      food: 'rgba(255,190,110,0.5)',
      weapon: 'rgba(255,110,140,0.5)',
      power: 'rgba(110,240,150,0.5)',
      missile: 'rgba(130,160,255,0.5)',
      shield: 'rgba(110,230,240,0.5)',
      life: 'rgba(255,170,200,0.5)',
    };
    const glowColor = STATIC_GLOW[k.type] || `${POWERUPS[k.type].color}90`;
    ctx.translate(k.x, k.y + bob);
    const g = cachedGradient(`pickup|${k.type}|${k.r.toFixed(1)}`, () => {
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, k.r * 2.1);
      grd.addColorStop(0, glowColor);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      return grd;
    });
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, k.r * 2.1, 0, TAU);
    ctx.fill();
    ctx.restore();

    art.draw(ctx, key, k.x, k.y + bob, k.rot, 1);

    // Gift boxes are labelled so players learn what each one does.
    let label = null;
    let labelColor = '#fff';
    if (k.type === 'weapon') {
      const wpn = WEAPONS.find((w) => w.id === k.weaponId);
      if (wpn) {
        label = wpn.short;
        labelColor = wpn.color;
      }
    } else if (POWERUPS[k.type]) {
      label = POWERUPS[k.type].short;
      labelColor = POWERUPS[k.type].color;
    }
    if (label) {
      ctx.font = `900 ${Math.round(8.5 * this.unit)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.5 * this.unit;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(label, k.x, k.y + bob + k.r * 1.55);
      ctx.fillStyle = labelColor;
      ctx.fillText(label, k.x, k.y + bob + k.r * 1.55);
    }
    ctx.restore();
  }
}
