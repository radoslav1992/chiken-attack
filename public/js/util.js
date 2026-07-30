/* Small math / helper library shared by every module. */

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b = 0) => b + Math.random() * (a - b);
export const randInt = (a, b) => Math.floor(rand(a, b));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

/** Angle from (x1,y1) towards (x2,y2). */
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

/** Squared distance – avoids the sqrt in hot collision loops. */
export const dist2 = (x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};

export const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));

/** Circle overlap test. */
export const hits = (a, b) => {
  const r = a.r + b.r;
  return dist2(a.x, a.y, b.x, b.y) <= r * r;
};

/** Shortest signed difference between two angles. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Ease helpers used by banners and boss animations. */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Deterministic per-wave randomness so a given wave number always builds the
 * same formation (mulberry32).
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Object pool. Entities are recycled instead of allocated so the GC stays
 * quiet during heavy bullet/particle traffic on phones.
 */
export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
  }

  spawn(...args) {
    const obj = this.free.pop() || this.factory();
    obj.dead = false;
    this.reset(obj, ...args);
    this.active.push(obj);
    return obj;
  }

  /** Sweep dead entries back into the free list (swap-and-pop, order free). */
  sweep() {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].dead) {
        const obj = a[i];
        a[i] = a[a.length - 1];
        a.pop();
        this.free.push(obj);
      }
    }
  }

  clear() {
    for (const obj of this.active) this.free.push(obj);
    this.active.length = 0;
  }

  get length() {
    return this.active.length;
  }

  forEach(fn) {
    const a = this.active;
    for (let i = 0; i < a.length; i++) fn(a[i], i);
  }
}

/** Number formatting for the HUD (1 234 567). */
export function formatScore(n) {
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/*
 * Canvas gradients are expensive to build, and the bullet/pickup painters used
 * to allocate one per object per frame. They are cached here, keyed by shape,
 * and always built in local (translated) coordinates so they can be reused
 * wherever the object happens to be. Cleared on resize, when sizes change.
 */
const gradientCache = new Map();

export function cachedGradient(key, make) {
  let g = gradientCache.get(key);
  if (g === undefined) {
    g = make();
    gradientCache.set(key, g);
  }
  return g;
}

export function clearGradientCache() {
  gradientCache.clear();
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
