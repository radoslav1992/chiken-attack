/*
 * Orbit Cadet — pinball physics.
 *
 * Pinball lives or dies on ball feel, so this is deliberately its own module.
 * Two things matter more than anything else here:
 *
 * 1. TUNNELLING. A pinball travels many times its own radius per frame — at
 *    2400 units/s and 60 fps that is 40 units against a ball radius of 11. A
 *    naive per-frame position test walks straight through a wall, a flipper, or
 *    the whole bottom of the table. Rather than full continuous collision, the
 *    step size is capped so the ball can never move more than MAX_STEP (a third
 *    of its radius) between tests. Discrete tests are then always safe provided
 *    no wall is thinner than that, and it costs nothing: there is one ball.
 *
 * 2. THE FLIPPER IMPULSE. A flipper does not just reflect the ball, it throws
 *    it. The surface velocity at the contact point (omega x r) is folded into
 *    the relative velocity before reflecting, which is what produces a real
 *    snap and lets a player aim a ramp on purpose instead of hoping.
 *
 * Coordinates are fixed table units with +y pointing DOWN the table, toward the
 * flippers and the drain — the direction the ball falls. Rendering scales this
 * to the canvas; nothing here knows about pixels.
 */

export const TABLE_W = 560;
export const TABLE_H = 1000;

const BALL_R = 11;
const MAX_STEP = BALL_R / 3; // the tunnelling guarantee
const MAX_SUBSTEPS = 64;

/* A real table is inclined about 6.5 degrees, so the ball is pulled by
 * g*sin(6.5) rather than g. This is the tuned equivalent in table units. */
const GRAVITY = 1750;
const AIR_DRAG = 0.16; // gentle: a pinball is heavy and does not float
const MAX_SPEED = 3000;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dot = (ax, ay, bx, by) => ax * bx + ay * by;

/* --- Surface kinds --------------------------------------------------------
 * Restitution is per-surface because it is most of the table's character: a
 * rubber ring throws the ball back hard, a metal guide barely gives at all, and
 * a plastic ramp wall is somewhere between.
 */
export const SURF = {
  wall: { bounce: 0.36, friction: 0.02 },
  metal: { bounce: 0.28, friction: 0.015 },
  rubber: { bounce: 0.72, friction: 0.05 },
  post: { bounce: 0.68, friction: 0.04 },
  wood: { bounce: 0.3, friction: 0.06 },
  dead: { bounce: 0.06, friction: 0.3 }, // absorbs, for target faces
};

/* --- Geometry primitives -------------------------------------------------
 * Each returns the closest point on itself to the ball centre, which is all the
 * collision resolution needs: the normal is the offset from that point, and the
 * penetration depth follows from its length.
 */

export const seg = (x1, y1, x2, y2, surf = 'wall', opts = {}) => ({
  kind: 'seg', x1, y1, x2, y2, surf, ...opts,
});

export const arc = (cx, cy, r, a0, a1, surf = 'wall', opts = {}) => ({
  kind: 'arc', cx, cy, r, a0, a1, surf, inner: !!opts.inner, ...opts,
});

export const circle = (cx, cy, r, surf = 'post', opts = {}) => ({
  kind: 'circle', cx, cy, r, surf, ...opts,
});

function closestOnSeg(s, px, py) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - s.x1) * dx + (py - s.y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: s.x1 + dx * t, y: s.y1 + dy * t, t };
}

/** Normalise to [0, 2pi). */
const norm = (a) => {
  const TAU = Math.PI * 2;
  a %= TAU;
  return a < 0 ? a + TAU : a;
};

/** Is `a` inside the arc sweep from a0 to a1 (counter-clockwise)? */
function inSweep(a, a0, a1) {
  const s = norm(a1 - a0);
  const d = norm(a - a0);
  return d <= s;
}

function closestOnArc(o, px, py) {
  const dx = px - o.cx;
  const dy = py - o.cy;
  const d = Math.hypot(dx, dy) || 1e-6;
  const ang = Math.atan2(dy, dx);
  if (!inSweep(ang, o.a0, o.a1)) {
    // Outside the sweep: the nearest point is whichever endpoint is closer.
    const e0x = o.cx + Math.cos(o.a0) * o.r;
    const e0y = o.cy + Math.sin(o.a0) * o.r;
    const e1x = o.cx + Math.cos(o.a1) * o.r;
    const e1y = o.cy + Math.sin(o.a1) * o.r;
    const d0 = Math.hypot(px - e0x, py - e0y);
    const d1 = Math.hypot(px - e1x, py - e1y);
    return d0 < d1 ? { x: e0x, y: e0y, cap: true } : { x: e1x, y: e1y, cap: true };
  }
  return { x: o.cx + (dx / d) * o.r, y: o.cy + (dy / d) * o.r, radial: true, dist: d };
}

/* --- Flipper -------------------------------------------------------------
 * A capsule pivoting about one end. `rest` and `swing` are the angles of the
 * down and up positions; `up` is driven by the player's button.
 */
export function makeFlipper({ x, y, len, rest, swing, radius = 9, side = 1 }) {
  return {
    kind: 'flipper',
    x, y, len, radius, side,
    rest,
    swing,
    angle: rest,
    omega: 0,
    up: false,
    /** Tip position, recomputed on demand. */
    tip() {
      return { x: this.x + Math.cos(this.angle) * this.len, y: this.y + Math.sin(this.angle) * this.len };
    },
  };
}

/* Flippers snap up fast and fall back slower, the same asymmetry that makes a
 * jump feel right in a platformer. */
const FLIP_UP_SPEED = 26; // rad/s
const FLIP_DOWN_SPEED = 15;

export function stepFlipper(f, dt) {
  const target = f.up ? f.swing : f.rest;
  const speed = f.up ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
  const prev = f.angle;
  const diff = target - f.angle;
  const move = Math.sign(diff) * speed * dt;
  f.angle = Math.abs(move) >= Math.abs(diff) ? target : f.angle + move;
  f.omega = dt > 0 ? (f.angle - prev) / dt : 0;
}

function closestOnFlipper(f, px, py) {
  const t = f.tip();
  return closestOnSeg({ x1: f.x, y1: f.y, x2: t.x, y2: t.y }, px, py);
}

/* --- The ball ------------------------------------------------------------ */

export function makeBall(x, y, vx = 0, vy = 0) {
  return { x, y, vx, vy, r: BALL_R, live: true, rest: 0 };
}

export { BALL_R, GRAVITY, MAX_SPEED };

/* --- Integration ---------------------------------------------------------
 * `world` supplies the static geometry, the flippers and a hit callback. The
 * callback is where the table's logic lives — scoring a bumper, dropping a
 * target — so the physics stays free of game rules.
 */
export function stepBall(ball, dt, world) {
  if (!ball.live) return;

  // Adaptive substepping: bound the displacement per step so a discrete test
  // can never miss a wall. This is the tunnelling guarantee.
  const speed = Math.hypot(ball.vx, ball.vy);
  const steps = clamp(Math.ceil((speed * dt) / MAX_STEP), 1, MAX_SUBSTEPS);
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    // Gravity, drag, nudge.
    ball.vy += GRAVITY * h;
    if (world.nudgeX) ball.vx += world.nudgeX * h;
    if (world.nudgeY) ball.vy += world.nudgeY * h;
    const drag = 1 - AIR_DRAG * h;
    ball.vx *= drag;
    ball.vy *= drag;

    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > MAX_SPEED) {
      ball.vx = (ball.vx / sp) * MAX_SPEED;
      ball.vy = (ball.vy / sp) * MAX_SPEED;
    }

    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    resolve(ball, world, h);

    /* Clamp AFTER resolution as well. Bumper kicks and flipper impulses are
     * added during collision response, so clamping only before the move let a
     * ball caught between two bumpers compound kick on kick — it reached 6816
     * against a 3000 cap, which is fast enough to defeat the substep bound and
     * tunnel. */
    const after = Math.hypot(ball.vx, ball.vy);
    if (after > MAX_SPEED) {
      ball.vx = (ball.vx / after) * MAX_SPEED;
      ball.vy = (ball.vy / after) * MAX_SPEED;
    }

    if (!ball.live) return;
  }
}

/** Push the ball out of anything it overlaps and reflect its velocity. */
function resolve(ball, world, h) {
  for (let pass = 0; pass < 3; pass++) {
    let touched = false;

    for (const o of world.solids) {
      if (o.off) continue;
      if (hitStatic(ball, o, world)) touched = true;
      if (!ball.live) return;
    }

    for (const f of world.flippers) {
      if (hitFlipper(ball, f, world, h)) touched = true;
    }

    if (!touched) break;
  }
}

function hitStatic(ball, o, world) {
  let cx;
  let cy;
  let minDist = ball.r;

  if (o.kind === 'seg') {
    const c = closestOnSeg(o, ball.x, ball.y);
    cx = c.x;
    cy = c.y;
    if (o.thick) minDist += o.thick;
  } else if (o.kind === 'arc') {
    const c = closestOnArc(o, ball.x, ball.y);
    cx = c.x;
    cy = c.y;
    if (o.thick) minDist += o.thick;
  } else {
    // Solid circle: post or bumper.
    cx = o.cx;
    cy = o.cy;
    minDist += o.r;
  }

  let nx = ball.x - cx;
  let ny = ball.y - cy;
  let d = Math.hypot(nx, ny);

  if (o.kind === 'circle') {
    if (d >= minDist) return false;
    if (d < 1e-6) {
      nx = 0;
      ny = -1;
      d = 1;
    }
    nx /= d;
    ny /= d;
    ball.x = o.cx + nx * minDist;
    ball.y = o.cy + ny * minDist;
  } else {
    if (d >= minDist) return false;
    if (d < 1e-6) {
      // Dead centre on the surface: fall back to the segment's own normal.
      if (o.kind === 'seg') {
        const dx = o.x2 - o.x1;
        const dy = o.y2 - o.y1;
        const l = Math.hypot(dx, dy) || 1;
        nx = -dy / l;
        ny = dx / l;
      } else {
        nx = 0;
        ny = -1;
      }
      d = 1;
    } else {
      nx /= d;
      ny /= d;
    }
    ball.x = cx + nx * minDist;
    ball.y = cy + ny * minDist;
  }

  bounce(ball, nx, ny, o, world);
  return true;
}

function hitFlipper(ball, f, world, h) {
  const c = closestOnFlipper(f, ball.x, ball.y);
  const minDist = ball.r + f.radius;
  let nx = ball.x - c.x;
  let ny = ball.y - c.y;
  let d = Math.hypot(nx, ny);
  if (d >= minDist) return false;
  if (d < 1e-6) {
    nx = 0;
    ny = -1;
    d = 1;
  }
  nx /= d;
  ny /= d;
  ball.x = c.x + nx * minDist;
  ball.y = c.y + ny * minDist;

  /* The throw. The contact point on a rotating flipper is itself moving at
   * omega x r; folding that into the relative velocity before reflecting is the
   * difference between a flipper that bats the ball and one that merely stops
   * it. */
  const rx = c.x - f.x;
  const ry = c.y - f.y;
  const surfVx = -f.omega * ry;
  const surfVy = f.omega * rx;

  const relVx = ball.vx - surfVx;
  const relVy = ball.vy - surfVy;
  const vn = dot(relVx, relVy, nx, ny);

  if (vn < 0) {
    const bounceAmt = 0.5;
    const outVx = relVx - (1 + bounceAmt) * vn * nx;
    const outVy = relVy - (1 + bounceAmt) * vn * ny;
    ball.vx = outVx + surfVx;
    ball.vy = outVy + surfVy;
    if (world.onFlipperHit) world.onFlipperHit(f, Math.abs(vn), Math.abs(f.omega));
  } else if (f.omega !== 0) {
    // Already separating but the flipper is still driving: nudge it along so a
    // ball resting on the flipper still gets launched.
    ball.vx += surfVx * 0.5;
    ball.vy += surfVy * 0.5;
  }
  ball.rest = 0;
  return true;
}

function bounce(ball, nx, ny, o, world) {
  const s = SURF[o.surf] || SURF.wall;
  const vn = dot(ball.vx, ball.vy, nx, ny);
  if (vn < 0) {
    // Normal component reflects and loses energy; tangential loses a little to
    // friction, which is what stops the ball skating along guides forever.
    const restitution = o.bounce ?? s.bounce;
    const tx = ball.vx - vn * nx;
    const ty = ball.vy - vn * ny;
    const fr = 1 - (o.friction ?? s.friction);
    ball.vx = tx * fr - vn * nx * restitution;
    ball.vy = ty * fr - vn * ny * restitution;

    // An active bumper adds its own energy rather than merely returning some.
    if (o.kick) {
      ball.vx += nx * o.kick;
      ball.vy += ny * o.kick;
    }
    if (world.onHit) world.onHit(o, Math.abs(vn));
    ball.rest = 0;
  }
}

/* --- Helpers for the table ---------------------------------------------- */

/** A thin wall as a segment with thickness, so both faces are solid. */
export const wall = (x1, y1, x2, y2, surf = 'wall', thick = 4) => seg(x1, y1, x2, y2, surf, { thick });

/** Build the chain of segments through a list of points. */
export function chain(points, surf = 'wall', thick = 4) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    out.push(wall(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], surf, thick));
  }
  return out;
}
