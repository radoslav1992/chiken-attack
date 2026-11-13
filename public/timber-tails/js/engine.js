/*
 * Timber Tails — simulation. Pure module: no DOM, no canvas, no audio, so the
 * same code runs the game in the browser and the level solver in the tests.
 *
 * One Game is one attempt at one stage. It advances in fixed 60 Hz steps and
 * reports what happened through `events`, which the shell drains for sound and
 * particles. Coordinates are pixels; a tile is 16 px.
 */

export const T = 16;

export const AIR = 0,
  GROUND = 1,
  STONE = 2,
  CRATE = 3,
  STASH = 4,
  USED = 5,
  BRANCH = 6,
  THORN = 7,
  SHROOM = 8,
  ICE = 9,
  WATER = 10,
  CRUMBLE = 11,
  ACORN = 12,
  LOG = 13,
  BERRY = 14,
  CHECK = 15,
  GOAL = 16;

const SOLID = [0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0];

export const PHYS = {
  ACC: 0.2,
  AIR_ACC: 0.16,
  FRIC: 0.22,
  ICE_ACC: 0.05,
  ICE_FRIC: 0.012,
  MAX: 2,
  JUMP: 5.6,
  G_HOLD: 0.24,
  G: 0.55,
  MAX_FALL: 5.5,
  COYOTE: 6,
  JUMP_BUFFER: 7,
  BOUNCE: 7.4,
};

const STOMP_CHAIN = [100, 200, 400, 800, 1000, 2000];

/** Hitboxes and behaviour flags per creature. */
const KINDS = {
  snail: { w: 12, h: 10, speed: 0.3, walker: true },
  beetle: { w: 12, h: 10, speed: 0.8, walker: true },
  hog: { w: 12, h: 10, speed: 0.5, walker: true, spiky: true },
  frog: { w: 12, h: 10 },
  wasp: { w: 12, h: 10, flying: true },
  bat: { w: 12, h: 8, flying: true },
  pike: { w: 10, h: 14, flying: true },
  icicle: { w: 8, h: 14, hazard: true },
  geyser: { w: 10, h: 48, hazard: true },
  saw: { w: 14, h: 14, hazard: true },
  ripple: { w: 10, h: 8, hazard: true },
  boar: { w: 28, h: 20 },
};

function makeEnt(def) {
  const k = KINDS[def.t];
  if (def.t === 'mover') {
    const x = def.x * T,
      y = def.y * T;
    return {
      type: 'mover',
      x,
      y,
      px: x,
      py: y,
      w: 48,
      h: 8,
      axis: def.axis,
      min: def.axis === 'x' ? Math.min(x, x + def.range * T) : Math.min(y, y + def.range * T),
      max: def.axis === 'x' ? Math.max(x, x + def.range * T) : Math.max(y, y + def.range * T),
      dir: def.range > 0 ? 1 : -1,
      wait: 0,
      dx: 0,
      dy: 0,
      t: 0,
    };
  }
  const e = {
    type: def.t,
    x: def.x * T + (T - k.w) / 2,
    y: (def.y + 1) * T - k.h,
    w: k.w,
    h: k.h,
    vx: 0,
    vy: 0,
    t: (def.x * 37) % 200,
    dead: 0,
    onGround: false,
    spiky: !!k.spiky,
    hazard: !!k.hazard,
    flying: !!k.flying,
    face: -1,
    state: '',
  };
  e.ox = e.x;
  e.oy = e.y;
  if (k.walker) e.vx = -k.speed;
  if (def.t === 'bat') {
    e.y = e.oy = def.y * T;
    e.state = 'hang';
  }
  if (def.t === 'pike') {
    e.base = (def.y + 2) * T;
    e.y = e.base;
  }
  if (def.t === 'icicle') {
    e.y = e.oy = def.y * T;
    e.state = 'hang';
  }
  if (def.t === 'geyser') {
    e.y = (def.y + 1) * T - 48;
    e.x = def.x * T + 3;
  }
  if (def.t === 'saw') {
    e.axis = def.axis || 'x';
    e.x = def.x * T + 1;
    e.y = def.y * T + 1;
    e.ox = e.x;
    e.oy = e.y;
    e.range = (def.range || 3) * T;
    e.t = 0;
  }
  if (def.t === 'boar') {
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.world = def.world;
    e.speed = 1.3 + def.world * 0.09;
    e.state = 'idle';
    e.charges = 0;
  }
  return e;
}

export class Game {
  /**
   * @param level a built level (see levels.js)
   * @param o carry-over: { score, acorns, lives, hearts, cones, logs, checkpoint }
   *          plus { solver, handicap } for the test-side reachability check.
   */
  constructor(level, o = {}) {
    this.level = level;
    this.w = level.w;
    this.h = level.h;
    this.frame = 0;
    this.events = [];
    this.state = 'play';
    this.tiles = Uint8Array.from(level.tiles);
    this.stash = new Map();
    for (const [idx, v] of level.stash) this.stash.set(idx, { ...v });
    this.score = o.score || 0;
    this.acorns = o.acorns || 0;
    this.lives = o.lives ?? 3;
    this.logs = o.logs || 0;
    this.solver = !!o.solver;
    this.handicap = o.handicap || 1;
    this.timeLeft = level.time * 60;
    level.logs.forEach((idx, bit) => {
      if (this.logs & (1 << bit)) this.tiles[idx] = AIR;
    });
    this.checkpoint = o.checkpoint || null;
    const at = this.checkpoint || level.spawn;
    this.p = {
      x: at.x * T + 3,
      y: (at.y + 1) * T - 14,
      py: 0,
      w: 10,
      h: 14,
      vx: 0,
      vy: 0,
      face: 1,
      onGround: false,
      ground: 0,
      ride: null,
      hearts: o.hearts ?? 3,
      cones: !!o.cones,
      inv: 0,
      gold: 0,
      slam: false,
      lag: 0,
      coyote: 0,
      jbuf: 0,
      hold: false,
      bounce: false,
      dropT: 0,
      combo: 0,
      dead: false,
      deadT: 0,
      anim: 0,
      throwT: 0,
      bounced: false,
    };
    this.ents = [];
    this.crumble = new Map();
    this.arena = level.arena || null;
    this.bossDead = !this.arena;
    this.bossActive = false;
    this.boss = null;
    if (!this.solver) {
      for (const def of level.ents) {
        const e = makeEnt(def);
        this.ents.push(e);
        if (e.type === 'boar') this.boss = e;
      }
    }
    this.movers = this.ents.filter((e) => e.type === 'mover');
  }

  /* ------------------------------------------------------------- tiles -- */

  tile(c, r) {
    if (c < 0 || c >= this.w) return STONE;
    if (r < 0 || r >= this.h) return AIR;
    return this.tiles[r * this.w + c];
  }
  solid(c, r) {
    return SOLID[this.tile(c, r)] === 1;
  }
  support(c, r) {
    const t = this.tile(c, r);
    return SOLID[t] === 1 || t === BRANCH;
  }
  emit(type, x, y, extra) {
    this.events.push({ type, x, y, ...extra });
  }
  addScore(n, x, y) {
    this.score += n;
    if (x !== undefined) this.emit('pop', x, y, { text: String(n) });
  }
  addAcorn(x, y) {
    this.acorns++;
    this.score += 10;
    this.emit('acorn', x, y);
    if (this.acorns % 100 === 0) {
      this.lives++;
      this.emit('life', x, y);
    }
  }

  breakCrate(c, r) {
    this.tiles[r * this.w + c] = AIR;
    this.score += 20;
    this.emit('break', c * T + 8, r * T + 8);
    this.knockAbove(c, r);
  }
  popStash(c, r) {
    const idx = r * this.w + c;
    const s = this.stash.get(idx) || { item: 'a', n: 1 };
    const x = c * T + 8,
      y = r * T - 4;
    this.knockAbove(c, r);
    this.emit('bump', x, r * T + 8, { c, r });
    if (s.item === 'a') {
      this.addAcorn(x, y);
      this.emit('coinpop', x, y);
      if (--s.n <= 0) this.tiles[idx] = USED;
      return;
    }
    this.tiles[idx] = USED;
    this.emit('sprout', x, y);
    this.ents.push({
      type: 'item',
      kind: s.item,
      x: c * T + 2,
      y: r * T,
      w: 12,
      h: 12,
      vx: 0,
      vy: 0,
      rise: 16,
      t: 0,
      dead: 0,
      onGround: false,
    });
  }
  /** A block struck from below (or slammed) flips whatever stands on it. */
  knockAbove(c, r) {
    for (const e of this.ents) {
      if (e.dead || e.type === 'mover' || e.type === 'item' || e.type === 'boar' || e.hazard)
        continue;
      if (
        e.x + e.w > c * T &&
        e.x < (c + 1) * T &&
        Math.abs(e.y + e.h - r * T) < 3
      )
        this.kill(e, 100);
    }
  }
  kill(e, points) {
    if (e.dead) return;
    e.dead = 1;
    e.vy = -3;
    if (points) this.addScore(points, e.x + e.w / 2, e.y);
    this.emit('defeat', e.x + e.w / 2, e.y + e.h / 2, { kind: e.type });
  }

  /* ------------------------------------------------------------ player -- */

  hurt(fromX) {
    const p = this.p;
    if (p.dead || p.inv > 0 || p.gold > 0 || this.state !== 'play') return;
    p.hearts--;
    p.cones = false;
    p.slam = false;
    if (p.hearts <= 0) return this.die('hurt');
    p.inv = 100;
    p.vy = -3.2;
    p.vx = (fromX !== undefined ? Math.sign(p.x + p.w / 2 - fromX) || -p.face : -p.face) * 1.8;
    p.onGround = false;
    p.ride = null;
    this.emit('hurt', p.x, p.y);
  }
  die(cause) {
    const p = this.p;
    if (p.dead) return;
    p.dead = true;
    p.deadT = 0;
    p.hearts = 0;
    p.vx = 0;
    p.vy = cause === 'splash' ? 0 : -5;
    p.cause = cause;
    p.ride = null;
    this.emit(cause === 'splash' ? 'splash' : 'die', p.x + 5, p.y + 7);
  }

  stepPlayer(inp) {
    const p = this.p,
      P = PHYS;
    if (p.dead) {
      p.deadT++;
      if (p.cause !== 'splash') {
        p.vy = Math.min(p.vy + 0.3, 6);
        p.y += p.vy;
      } else p.y += 0.4;
      if (p.deadT > 80) this.state = 'dead';
      return;
    }
    if (p.inv > 0) p.inv--;
    if (p.gold > 0) p.gold--;
    if (p.lag > 0) p.lag--;
    if (p.dropT > 0) p.dropT--;
    if (p.throwT > 0) p.throwT--;

    if (p.ride) {
      p.x += p.ride.dx;
      p.y = p.ride.y - p.h;
    }

    /* horizontal intent */
    let dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (p.slam || p.lag > 0) dir = 0;
    const ice = p.onGround && p.ground === ICE;
    const acc = p.onGround ? (ice ? P.ICE_ACC : P.ACC) : P.AIR_ACC;
    const max = P.MAX * this.handicap;
    if (dir) {
      const turning = Math.sign(p.vx) === -dir;
      p.vx += dir * acc * (turning && !ice ? 2 : 1);
      p.face = dir;
    } else if (p.onGround) {
      const f = ice ? P.ICE_FRIC : P.FRIC;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
    } else {
      p.vx *= 0.97;
    }
    if (p.vx > max) p.vx = Math.max(max, p.vx - 0.2);
    if (p.vx < -max) p.vx = Math.min(-max, p.vx + 0.2);

    /* jump, drop-through, slam */
    if (inp.jumpPressed) p.jbuf = P.JUMP_BUFFER;
    else if (p.jbuf > 0) p.jbuf--;
    if (p.onGround) {
      p.coyote = P.COYOTE;
      p.combo = 0;
    } else if (p.coyote > 0) p.coyote--;
    if (p.jbuf > 0 && p.coyote > 0 && !p.slam && p.lag === 0) {
      p.jbuf = 0;
      p.coyote = 0;
      if (inp.down && p.onGround && (p.ground === BRANCH || p.ride)) {
        p.dropT = 10;
        p.y += 1;
      } else {
        p.vy = -P.JUMP * (this.handicap < 1 ? 0.97 : 1);
        p.hold = true;
        p.bounce = false;
        this.emit('jump', p.x, p.y);
      }
      p.onGround = false;
      p.ride = null;
    }
    if (inp.downPressed && !p.onGround && !p.slam && p.coyote === 0) {
      p.slam = true;
      p.vx = 0;
      p.vy = Math.max(p.vy, 1);
      this.emit('dive', p.x, p.y);
    }
    if (inp.actionPressed && p.cones && p.throwT === 0 && !p.slam) {
      const live = this.ents.filter((e) => e.type === 'cone' && !e.dead).length;
      if (live < 2) {
        p.throwT = 14;
        this.ents.push({
          type: 'cone',
          x: p.x + (p.face > 0 ? 8 : -6),
          y: p.y + 3,
          w: 8,
          h: 8,
          vx: p.face * 3.6,
          vy: -1.2,
          t: 0,
          bounces: 0,
          dead: 0,
        });
        this.emit('throw', p.x, p.y);
      }
    }

    /* gravity */
    if (p.slam) {
      p.vy = Math.min(p.vy + 0.9, 7.5);
      p.vx = 0;
    } else {
      const rising = p.vy < 0;
      if (rising && p.hold && !inp.jump) p.hold = false;
      const g = rising && (p.bounce || p.hold) ? P.G_HOLD : P.G;
      p.vy = Math.min(p.vy + g, P.MAX_FALL);
    }

    this.moveX(p);
    this.moveY(p, inp);
    this.touchTiles(p);
    if (p.y > this.h * T + 8) this.die('fall');
    if (!this.solver && --this.timeLeft <= 0) this.die('time');
    p.anim += Math.abs(p.vx);
  }

  moveX(p) {
    p.x += p.vx;
    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    }
    if (p.x + p.w > this.w * T) {
      p.x = this.w * T - p.w;
      p.vx = 0;
    }
    const r0 = Math.floor(p.y / T),
      r1 = Math.floor((p.y + p.h - 0.001) / T);
    if (p.vx > 0) {
      const c = Math.floor((p.x + p.w - 0.001) / T);
      for (let r = r0; r <= r1; r++)
        if (this.solid(c, r)) {
          p.x = c * T - p.w;
          p.vx = 0;
          break;
        }
    } else if (p.vx < 0) {
      const c = Math.floor(p.x / T);
      for (let r = r0; r <= r1; r++)
        if (this.solid(c, r)) {
          p.x = (c + 1) * T;
          p.vx = 0;
          break;
        }
    }
  }

  moveY(p, inp) {
    const prevBottom = p.y + p.h;
    const wasGround = p.onGround;
    p.py = p.y;
    p.y += p.vy;
    p.onGround = false;
    p.ride = null;
    const c0 = Math.floor(p.x / T),
      c1 = Math.floor((p.x + p.w - 0.001) / T);
    if (p.vy < 0) {
      const r = Math.floor(p.y / T);
      const s0 = this.solid(c0, r),
        s1 = this.solid(c1, r);
      if (s0 || s1) {
        /* Clip a corner by a few pixels and the beaver slides round it. */
        if (s0 !== s1) {
          const over = s0 ? (c0 + 1) * T - p.x : p.x + p.w - c1 * T;
          if (over <= 4) {
            const nx = s0 ? (c0 + 1) * T : c1 * T - p.w;
            const nc = Math.floor((nx + (s0 ? p.w - 0.001 : 0)) / T);
            if (!this.solid(nc, r) && !this.solid(nc, Math.floor((p.y + p.h - 0.001) / T))) {
              p.x = nx;
              return;
            }
          }
        }
        p.y = (r + 1) * T;
        p.vy = 0;
        p.hold = false;
        p.bounce = false;
        const cc = Math.floor((p.x + p.w / 2) / T);
        const c = this.solid(cc, r) ? cc : s0 ? c0 : c1;
        const t = this.tile(c, r);
        if (t === CRATE) this.breakCrate(c, r);
        else if (t === STASH) this.popStash(c, r);
        else this.emit('thud', p.x, p.y);
      }
      return;
    }
    const bottom = p.y + p.h;
    const r = Math.floor((bottom - 0.001) / T);
    let landed = 0;
    for (let c = c0; c <= c1; c++) {
      const t = this.tile(c, r);
      if (SOLID[t] || (t === BRANCH && p.dropT === 0 && prevBottom <= r * T + 0.01)) {
        const centre = c === Math.floor((p.x + p.w / 2) / T);
        if (!landed || centre) landed = t;
      }
    }
    if (landed) {
      p.y = r * T - p.h;
      p.ground = landed;
    } else if (p.dropT === 0) {
      for (const m of this.movers) {
        if (
          p.x + p.w > m.x &&
          p.x < m.x + m.w &&
          prevBottom <= Math.max(m.py, m.y) + 1 &&
          bottom >= m.y
        ) {
          p.y = m.y - p.h;
          p.ride = m;
          p.ground = BRANCH;
          landed = BRANCH;
          break;
        }
      }
    }
    if (!landed) return;
    const fell = p.vy;
    p.vy = 0;
    p.onGround = true;
    p.bounce = false;
    const slammed = p.slam;
    if (slammed) this.slamLand(p, c0, c1, r);
    let shroom = false;
    for (let c = c0; c <= c1; c++) if (this.tile(c, r) === SHROOM) shroom = true;
    if (shroom && !p.ride) {
      p.vy = -(slammed ? 8.8 : PHYS.BOUNCE);
      p.bounce = true;
      p.onGround = false;
      p.lag = 0;
      p.coyote = 0;
      p.bounced = true;
      this.emit('boing', p.x + 5, p.y + p.h);
      return;
    }
    if (!wasGround && fell > 2 && !slammed) this.emit('land', p.x + 5, p.y + p.h);
    if (!this.solver) {
      for (let c = c0; c <= c1; c++) {
        if (this.tile(c, r) === CRUMBLE) {
          const idx = r * this.w + c;
          if (!this.crumble.has(idx)) this.crumble.set(idx, 0);
        }
      }
    }
  }

  slamLand(p, c0, c1, r) {
    p.slam = false;
    p.lag = 9;
    const cx = p.x + p.w / 2;
    this.emit('slam', cx, p.y + p.h);
    if (!p.ride) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tile(c, r);
        if (t === CRATE) this.breakCrate(c, r);
        else if (t === STASH) this.popStash(c, r);
      }
    }
    for (const e of this.ents) {
      if (e.dead || e.type === 'mover' || e.type === 'item' || e.type === 'cone') continue;
      if (e.hazard || e.flying) continue;
      const dx = Math.abs(e.x + e.w / 2 - cx);
      if (dx > 34 || Math.abs(e.y + e.h - (p.y + p.h)) > 12) continue;
      if (e.type === 'boar') continue;
      this.kill(e, 200);
    }
  }

  touchTiles(p) {
    const c0 = Math.floor((p.x + 1) / T),
      c1 = Math.floor((p.x + p.w - 1.001) / T),
      r0 = Math.floor((p.y + 1) / T),
      r1 = Math.floor((p.y + p.h - 1.001) / T);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const t = this.tile(c, r);
        if (t < THORN || t === SHROOM || t === ICE || t === CRUMBLE) continue;
        const idx = r * this.w + c,
          x = c * T + 8,
          y = r * T + 8;
        if (t === ACORN) {
          this.tiles[idx] = AIR;
          this.addAcorn(x, y);
        } else if (t === LOG) {
          this.tiles[idx] = AIR;
          this.logs |= 1 << this.level.logs.indexOf(idx);
          this.addScore(1000, x, y - 8);
          this.emit('log', x, y);
        } else if (t === BERRY) {
          this.tiles[idx] = AIR;
          this.heal(x, y);
        } else if (t === THORN) {
          if (p.y + p.h > r * T + 6) this.hurt(x);
        } else if (t === WATER) {
          if (p.y + p.h > r * T + 8) return this.die('splash');
        } else if (t === CHECK) {
          if (!this.checkpoint || this.checkpoint.x !== c) {
            this.checkpoint = { x: c, y: r };
            this.emit('check', x, y);
          }
        } else if (t === GOAL) {
          if (this.bossDead && this.state === 'play') {
            this.state = 'clear';
            this.emit('clear', x, y);
          }
        }
      }
  }

  heal(x, y) {
    const p = this.p;
    if (p.hearts < 3) {
      p.hearts++;
      this.emit('berry', x, y);
    } else {
      this.addScore(200, x, y - 8);
      this.emit('berry', x, y);
    }
  }

  /* ---------------------------------------------------------- creatures -- */

  /** Shared ground physics for walkers, frogs, items and the boar. */
  bodyX(e, ledge) {
    const nx = e.x + e.vx;
    const r0 = Math.floor(e.y / T),
      r1 = Math.floor((e.y + e.h - 0.001) / T);
    let blocked = nx < 0 || nx + e.w > this.w * T;
    const c = Math.floor((e.vx > 0 ? nx + e.w - 0.001 : nx) / T);
    for (let r = r0; r <= r1 && !blocked; r++) if (this.solid(c, r)) blocked = true;
    if (!blocked && ledge && e.onGround) {
      const fc = Math.floor((e.vx > 0 ? nx + e.w + 1 : nx - 1) / T);
      const fr = Math.floor((e.y + e.h + 2) / T);
      if (!this.support(fc, fr) || this.tile(fc, fr - 1) === THORN) blocked = true;
    }
    if (blocked) return true;
    e.x = nx;
    return false;
  }
  bodyY(e, g = 0.4) {
    const prevBottom = e.y + e.h;
    e.vy = Math.min(e.vy + g, 5.5);
    e.y += e.vy;
    e.onGround = false;
    const c0 = Math.floor(e.x / T),
      c1 = Math.floor((e.x + e.w - 0.001) / T);
    if (e.vy < 0) {
      const r = Math.floor(e.y / T);
      if (this.solid(c0, r) || this.solid(c1, r)) {
        e.y = (r + 1) * T;
        e.vy = 0;
      }
      return;
    }
    const r = Math.floor((e.y + e.h - 0.001) / T);
    for (let c = c0; c <= c1; c++) {
      const t = this.tile(c, r);
      if (SOLID[t] || (t === BRANCH && prevBottom <= r * T + 0.01)) {
        e.y = r * T - e.h;
        e.vy = 0;
        e.onGround = true;
        return;
      }
    }
  }

  stepEnts(inp) {
    const p = this.p;
    const pcx = p.x + p.w / 2;
    for (const m of this.movers) {
      m.px = m.x;
      m.py = m.y;
      if (m.wait > 0) m.wait--;
      else {
        const k = m.axis === 'x' ? 'x' : 'y';
        m[k] += 0.6 * m.dir;
        if (m[k] >= m.max) {
          m[k] = m.max;
          m.dir = -1;
          m.wait = 30;
        } else if (m[k] <= m.min) {
          m[k] = m.min;
          m.dir = 1;
          m.wait = 30;
        }
      }
      m.dx = m.x - m.px;
      m.dy = m.y - m.py;
    }
    for (const e of this.ents) {
      if (e.type === 'mover') continue;
      if (e.dead) {
        e.dead++;
        e.vy += 0.3;
        e.y += e.vy;
        continue;
      }
      const far = Math.abs(e.x - p.x) > 300;
      if (far && e.type !== 'cone' && e.type !== 'saw' && e.type !== 'geyser' && e.type !== 'ripple') {
        if (e.type === 'boar' && this.bossActive) {
          /* the boss never sleeps mid-fight */
        } else continue;
      }
      e.t++;
      switch (e.type) {
        case 'snail':
        case 'beetle':
        case 'hog':
          if (this.bodyX(e, true)) e.vx = -e.vx;
          e.face = Math.sign(e.vx) || e.face;
          this.bodyY(e);
          break;
        case 'frog':
          if (e.onGround) {
            e.vx = 0;
            if (e.t > 80 && Math.abs(pcx - e.x) < 170) {
              e.t = 0;
              e.face = pcx > e.x ? 1 : -1;
              e.vx = e.face * 1.25;
              e.vy = -4.6;
              e.onGround = false;
            }
          }
          if (e.vx && this.bodyX(e, false)) e.vx = 0;
          this.bodyY(e, 0.32);
          break;
        case 'wasp':
          e.x = e.ox + Math.sin(e.t * 0.028) * 44;
          e.y = e.oy + Math.sin(e.t * 0.09) * 7;
          e.face = Math.cos(e.t * 0.028) > 0 ? 1 : -1;
          break;
        case 'bat':
          if (e.state === 'hang') {
            if (e.t > 50 && Math.abs(pcx - (e.x + 6)) < 84 && p.y > e.y) {
              e.state = 'swoop';
              e.t = 0;
              e.face = pcx > e.x ? 1 : -1;
            }
          } else {
            const ph = e.t * 0.036;
            const nx = e.x + e.face * 0.95;
            if (!this.solid(Math.floor((nx + 6) / T), Math.floor((e.y + 4) / T))) e.x = nx;
            e.y = e.oy + Math.sin(ph) * 54;
            if (ph >= Math.PI) {
              e.y = e.oy;
              e.state = 'hang';
              e.t = 0;
            }
          }
          break;
        case 'pike': {
          const cyc = e.t % 170;
          if (cyc === 0) {
            e.y = e.base;
            e.vy = -5.75;
          }
          if (e.y < e.base || e.vy < 0) {
            e.vy += 0.18;
            e.y += e.vy;
            if (e.y > e.base) {
              e.y = e.base;
              e.vy = 0;
            }
          }
          break;
        }
        case 'icicle':
          if (e.state === 'hang') {
            if (Math.abs(pcx - (e.x + 4)) < 22 && p.y > e.y) {
              e.state = 'shake';
              e.t = 0;
            }
          } else if (e.state === 'shake') {
            if (e.t > 22) e.state = 'fall';
          } else {
            e.vy = Math.min(e.vy + 0.35, 6);
            e.y += e.vy;
            if (this.solid(Math.floor((e.x + 4) / T), Math.floor((e.y + e.h) / T)) || e.y > this.h * T) {
              e.dead = 40;
              this.emit('shatter', e.x + 4, e.y + e.h);
            }
          }
          break;
        case 'geyser': {
          const cyc = e.t % 240;
          e.state = cyc < 120 ? 'idle' : cyc < 165 ? 'warn' : cyc < 228 ? 'erupt' : 'idle';
          if (cyc === 165 && !far) this.emit('whoosh', e.x, e.y + 40);
          break;
        }
        case 'saw': {
          const s = Math.sin(e.t * 0.03) * e.range;
          if (e.axis === 'x') e.x = e.ox + s;
          else e.y = e.oy + s;
          break;
        }
        case 'ripple':
          e.x += e.vx;
          if (e.t > 110 || this.solid(Math.floor((e.x + 5) / T), Math.floor((e.y + 2) / T))) e.dead = 40;
          break;
        case 'cone':
          e.vy += 0.25;
          if (this.bodyX(e, false)) {
            e.dead = 40;
            this.emit('puff', e.x + 4, e.y + 4);
            break;
          }
          this.bodyY(e, 0);
          if (e.onGround) {
            e.vy = -2.6;
            if (++e.bounces > 3) e.dead = 40;
          }
          if (e.t > 90 || e.y > this.h * T) e.dead = 40;
          for (const o of this.ents) {
            if (o.dead || o === e || o.type === 'mover' || o.type === 'item' || o.type === 'cone') continue;
            if (o.hazard || o.type === 'boar') continue;
            if (e.x < o.x + o.w && e.x + e.w > o.x && e.y < o.y + o.h && e.y + e.h > o.y) {
              this.kill(o, 100);
              e.dead = 40;
              break;
            }
          }
          break;
        case 'item':
          this.stepItem(e);
          break;
        case 'boar':
          this.stepBoar(e);
          break;
      }
      if (e.dead || e.type === 'cone' || e.type === 'item') continue;
      this.touchEnemy(e, inp);
    }
    if (this.ents.length > 40 || this.frame % 60 === 0)
      this.ents = this.ents.filter((e) => !(e.dead > 40) || e.type === 'mover');
  }

  stepItem(e) {
    const p = this.p;
    if (e.rise > 0) {
      e.rise--;
      e.y -= 1;
      if (e.rise === 0 && (e.kind === 'g' || e.kind === 'l')) e.vx = p.x + 5 > e.x + 6 ? -1 : 1;
    } else if (e.kind === 'g' || e.kind === 'l') {
      if (this.bodyX(e, false)) e.vx = -e.vx;
      this.bodyY(e, 0.3);
      if (e.onGround && e.kind === 'g') e.vy = -4;
      if (e.y > this.h * T) e.dead = 41;
    }
    if (e.rise > 8 || p.dead) return;
    if (p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
      e.dead = 41;
      const x = e.x + 6,
        y = e.y;
      if (e.kind === 'h') this.heal(x, y);
      else if (e.kind === 'c') {
        p.cones = true;
        this.addScore(200, x, y - 8);
        this.emit('power', x, y);
      } else if (e.kind === 'g') {
        p.gold = 540;
        this.addScore(500, x, y - 8);
        this.emit('gold', x, y);
      } else if (e.kind === 'l') {
        this.lives++;
        this.emit('life', x, y);
      }
    }
  }

  touchEnemy(e, inp) {
    const p = this.p;
    if (p.dead || this.state !== 'play') return;
    let ex = e.x + 1,
      ey = e.y + 1,
      ew = e.w - 2,
      eh = e.h - 2;
    if (e.type === 'geyser') {
      if (e.state !== 'erupt') return;
    }
    if (e.type === 'boar' && (e.state === 'idle' || e.state === 'dying')) return;
    if (!(p.x < ex + ew && p.x + p.w > ex && p.y < ey + eh && p.y + p.h > ey)) return;
    const cx = e.x + e.w / 2;
    if (e.hazard) return this.hurt(cx);
    const above = p.vy > 0.3 && p.y + p.h - e.y < 10;
    if (e.type === 'boar') return this.touchBoar(e, above, inp);
    if (p.gold > 0) return this.kill(e, 200);
    if (above) {
      if (p.slam) {
        this.kill(e, 200);
        p.vy = -3;
        p.slam = false;
        return;
      }
      if (e.spiky) return this.hurt(cx);
      const pts = STOMP_CHAIN[Math.min(p.combo, STOMP_CHAIN.length - 1)];
      p.combo++;
      this.kill(e, pts);
      this.emit('stomp', cx, e.y);
      this.bouncePlayer(inp);
      return;
    }
    this.hurt(cx);
  }
  bouncePlayer(inp) {
    const p = this.p;
    p.y -= 1;
    if (inp.jump) {
      p.vy = -PHYS.JUMP;
      p.hold = true;
    } else {
      p.vy = -3.6;
      p.hold = false;
    }
    p.bounce = false;
    p.slam = false;
  }

  /* --------------------------------------------------------------- boss -- */

  stepBoar(e) {
    const a = this.arena,
      p = this.p;
    const left = a.x0 * T,
      right = a.x1 * T;
    const pcx = p.x + p.w / 2;
    switch (e.state) {
      case 'idle':
        return;
      case 'intro':
        e.face = pcx > e.x + e.w / 2 ? 1 : -1;
        if (e.t > 70) this.boarNext(e);
        break;
      case 'charge':
        e.vx = e.face * e.speed;
        e.x += e.vx;
        if (e.x <= left || e.x + e.w >= right) {
          e.x = Math.max(left, Math.min(right - e.w, e.x));
          e.vx = 0;
          e.state = 'stun';
          e.t = 0;
          this.emit('crash', e.x + e.w / 2, e.y + e.h);
        }
        break;
      case 'stun':
        if (e.t > Math.max(80, 110 - e.world * 4)) {
          e.face = -e.face;
          this.boarNext(e);
        }
        break;
      case 'leap':
        e.x = Math.max(left, Math.min(right - e.w, e.x + e.vx));
        e.vy += 0.3;
        e.y += e.vy;
        if (e.y >= e.oy) {
          e.y = e.oy;
          e.vy = 0;
          e.state = 'rest';
          e.t = 0;
          this.emit('crash', e.x + e.w / 2, e.y + e.h);
          if (e.world >= 5) {
            for (const d of [-1, 1])
              this.ents.push({
                type: 'ripple',
                x: e.x + e.w / 2 - 5 + d * 12,
                y: e.oy + e.h - 8,
                w: 10,
                h: 8,
                vx: d * 1.7,
                vy: 0,
                t: 0,
                dead: 0,
                hazard: true,
              });
          }
        }
        break;
      case 'rest':
        e.face = pcx > e.x + e.w / 2 ? 1 : -1;
        if (e.t > 34) {
          e.state = 'charge';
          e.t = 0;
        }
        break;
      case 'hit':
        if (e.t > 44) {
          e.face = pcx > e.x + e.w / 2 ? 1 : -1;
          this.boarNext(e);
        }
        break;
      case 'dying':
        if (e.t % 8 === 0) this.emit('puff', e.x + ((e.t * 7) % 28), e.y + ((e.t * 5) % 20));
        if (e.t > 90) {
          e.dead = 41;
          this.bossDead = true;
          this.boss = null;
          this.addScore(5000, e.x + 14, e.y);
          this.emit('bossdown', e.x + 14, e.y + 10);
        }
        break;
    }
  }
  boarNext(e) {
    const p = this.p;
    e.charges++;
    e.t = 0;
    if (e.world >= 3 && e.charges % 2 === 0) {
      const tx = Math.max(this.arena.x0 * T, Math.min(this.arena.x1 * T - e.w, p.x - 9));
      e.state = 'leap';
      e.vx = (tx - e.x) / 43;
      e.vy = -6.4;
      e.face = Math.sign(e.vx) || e.face;
      this.emit('leap', e.x, e.y);
    } else {
      e.state = 'charge';
      this.emit('snort', e.x, e.y);
    }
  }
  touchBoar(e, above, inp) {
    const p = this.p;
    const cx = e.x + e.w / 2;
    if (e.state === 'hit') return;
    if (above) {
      if (e.state === 'stun') {
        e.hp--;
        e.speed += 0.1;
        this.addScore(500, cx, e.y - 4);
        if (e.hp <= 0) {
          e.state = 'dying';
          e.t = 0;
          this.emit('bosshit', cx, e.y);
        } else {
          e.state = 'hit';
          e.t = 0;
          this.emit('bosshit', cx, e.y);
        }
      } else this.emit('clang', cx, e.y);
      p.slam = false;
      this.bouncePlayer(inp);
      return;
    }
    if (e.state === 'stun') return;
    this.hurt(cx);
  }
  stepArena() {
    const a = this.arena,
      p = this.p;
    if (!a || this.bossActive || this.bossDead || !this.boss) return;
    if (p.x > (a.x0 + 1) * T + 4) {
      this.bossActive = true;
      for (const idx of a.gate) this.tiles[idx] = STONE;
      this.boss.state = 'intro';
      this.boss.t = 0;
      this.emit('bossstart', this.boss.x, this.boss.y);
    }
  }

  /* --------------------------------------------------------------- step -- */

  step(inp) {
    if (this.state !== 'play') return;
    this.frame++;
    if (!this.solver) {
      this.stepArena();
      this.stepEnts(inp);
      for (const [idx, t] of this.crumble) {
        const n = t + 1;
        if (n === 26) {
          this.tiles[idx] = AIR;
          this.emit('crumble', (idx % this.w) * T + 8, Math.floor(idx / this.w) * T + 8);
        }
        if (n > 320) {
          const c = idx % this.w,
            r = Math.floor(idx / this.w),
            p = this.p;
          const clear = p.x + p.w <= c * T || p.x >= (c + 1) * T || p.y + p.h <= r * T || p.y >= (r + 1) * T;
          if (clear) {
            this.tiles[idx] = CRUMBLE;
            this.crumble.delete(idx);
            continue;
          }
        }
        this.crumble.set(idx, n);
      }
    }
    this.stepPlayer(inp);
  }
}

export const NO_INPUT = Object.freeze({
  left: false,
  right: false,
  jump: false,
  down: false,
  action: false,
  jumpPressed: false,
  downPressed: false,
  actionPressed: false,
});
