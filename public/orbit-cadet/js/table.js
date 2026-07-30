/*
 * Orbit Cadet — the table.
 *
 * One table, authored by hand, in the fixed 560 x 1000 unit space that
 * physics.js works in. +y points down the table, toward the flippers.
 *
 * The outer boundary is a single closed polygon. That is deliberate: the wall
 * segments are generated from it, AND the containment test in the harness does
 * point-in-polygon against the very same list. One source of truth means the
 * test cannot drift from the geometry it is checking.
 *
 * Ramps are real walled lanes rather than elevated tracks with a
 * capture-and-teleport trick. A physical lane means the loop shot behaves like a
 * loop shot for free — the ball goes up, round the dome and back down under its
 * own momentum — and nothing has to fake it.
 */

import { seg, arc, circle, wall, chain, makeFlipper, TABLE_W, TABLE_H } from './physics.js';

export { TABLE_W, TABLE_H };

/* --- The outer boundary --------------------------------------------------
 * Clockwise from the bottom-left of the left funnel, up the left side, over the
 * dome, down the right, into the plunger lane and back along the bottom. The
 * bottom edge is the drain mouth: it is part of the polygon so the containment
 * test is closed, but no wall is generated for it.
 */
export const BOUNDARY = [
  [206, 1000], // drain mouth, left lip
  [140, 934],
  [20, 762],
  [20, 300],
  [34, 226],
  [74, 158],
  [136, 104],
  [214, 70],
  [300, 60],
  [386, 78],
  [452, 118],
  [502, 176],
  [530, 240], // dome meets the plunger lane
  [540, 300],
  [540, 990],
  [478, 1000], // plunger lane floor
  [298, 1000], // drain mouth, right lip
];

/* Segments 1..DOME_END become walls. Beyond that the boundary is the open drain
 * mouth, which must close the polygon for the containment test but must not
 * become a wall — otherwise nothing can ever drain. */
const DOME_END = 15;

export const RANKS = [
  'Cadet',
  'Ensign',
  'Lieutenant',
  'Commander',
  'Captain',
  'Commodore',
  'Admiral',
];

export function buildTable() {
  const solids = [];
  const sensors = [];
  const lamps = [];

  /* --- outer walls, straight off the boundary polygon --- */
  for (let i = 1; i <= DOME_END; i++) {
    const a = BOUNDARY[i - 1];
    const b = BOUNDARY[i];
    solids.push(wall(a[0], a[1], b[0], b[1], i >= 3 && i <= 12 ? 'metal' : 'wall', 5));
  }
  // Right side of the playfield, which is also the plunger lane's inner wall.
  // It stops short at the top so a launched ball can climb out into the dome.
  solids.push(wall(498, 330, 498, 770, 'metal', 5));
  solids.push(wall(498, 770, 392, 934, 'wall', 5));
  solids.push(wall(392, 934, 298, 1000, 'wall', 5));

  /* --- the left orbit lane -------------------------------------------------
   * An inner guide running parallel to the dome. A ball shot up the left lane
   * follows it round the top and is spat out heading right across the upper
   * playfield — the loop shot, entirely under its own momentum.
   */
  const orbitGuide = [
    [74, 600],
    [76, 470],
    [96, 366],
    [140, 268],
    [206, 208],
    [286, 186],
  ];
  solids.push(...chain(orbitGuide, 'metal', 5));
  /* The trigger sits low in the lane, where it is narrow enough that a ball
   * travelling up CANNOT miss it. Higher up the lane is 130 units wide and the
   * ball hugs the outside of the curve, so a point sensor there is a coin flip —
   * placed at (150, 236) it never fired once. */
  sensors.push({ id: 'orbit', x: 48, y: 520, r: 26, need: 'up', label: 'ORBIT' });

  /* --- pop bumpers ---------------------------------------------------------
   * Three in a triangle. `kick` is what makes them bumpers rather than posts:
   * they add energy instead of returning a fraction of it.
   */
  const bumpers = [
    { x: 256, y: 372, r: 27 },
    { x: 198, y: 462, r: 27 },
    { x: 314, y: 462, r: 27 },
  ];
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    solids.push(circle(b.x, b.y, b.r, 'rubber', { kick: 620, bumper: i, bounce: 0.55 }));
    lamps.push({ x: b.x, y: b.y, r: b.r, kind: 'bumper', i });
  }

  /* --- drop targets, upper right ------------------------------------------
   * Each is a short face that switches off when hit. Clearing the bank is the
   * spine of the first mission.
   *
   * THE GAP RULE. Every gap in the geometry must be either flush or comfortably
   * wider than a ball — never in between. The bank first sat 12 units off the
   * right wall against a 22-unit ball, and the stochastic wedge test caught the
   * consequence immediately: the ball pinches between the two faces, the normals
   * cancel, and it sits there for the rest of the game. The bank now stands 60
   * units clear, which turns the space behind it into a passable lane, and the
   * rows are spaced so a ball can leave downwards too.
   */
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const ty = 296 + i * 74;
    const t = seg(396, ty, 434, ty + 26, 'dead', { target: i, bounce: 0.2 });
    t.thick = 5;
    solids.push(t);
    targets.push(t);
    lamps.push({ x: 415, y: ty + 13, r: 9, kind: 'target', i });
  }
  // A sloped feed above the bank. Never horizontal: a flat ledge inside the
  // table is a shelf the ball can rest on forever, since "downhill" here is
  // always +y.
  solids.push(wall(388, 250, 470, 272, 'metal', 5));

  /* --- mission selector and spinner ---------------------------------------
   * The selector is a rollover sensor, not a post. As a post it sat 14 units
   * off the orbit guide and trapped the ball; every position that cleared the
   * guide then pinched against a bumper instead. A sensor has no collision
   * geometry, so it cannot pinch against anything — and rolling over a target
   * to arm a mission is what a real table does anyway.
   */
  sensors.push({ id: 'selector', x: 128, y: 420, r: 22, label: 'MISSION' });
  lamps.push({ x: 128, y: 420, r: 15, kind: 'selector' });
  sensors.push({ id: 'spinner', x: 256, y: 610, r: 26, label: 'SPIN' });
  lamps.push({ x: 256, y: 610, r: 22, kind: 'spinner' });

  /* --- slingshots ---------------------------------------------------------
   * The rubber triangles above each flipper. Without them the lower playfield
   * is dead and a ball trickles quietly to the drain.
   */
  const slingPlates = [];
  const sling = (pts, side) => {
    slingPlates.push(pts);
    for (let i = 1; i < pts.length; i++) {
      solids.push(
        wall(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 'rubber', 5)
      );
      solids[solids.length - 1].kick = 300;
      solids[solids.length - 1].sling = side;
    }
  };
  // Set in far enough that the outlane either side is a passable channel. At
  // x=92 the left one left a 20.4u gap against a 22u ball, which is the trap the
  // gap rule warns about: too narrow to pass, wide enough to jam in.
  sling([[104, 716], [176, 796], [104, 808]], 'L');
  sling([[408, 716], [336, 796], [408, 808]], 'R');
  lamps.push({ x: 130, y: 768, r: 10, kind: 'sling' });
  lamps.push({ x: 382, y: 768, r: 10, kind: 'sling' });

  /* --- posts -------------------------------------------------------------- */
  for (const [x, y] of [[196, 606], [316, 606], [130, 540], [382, 540]]) {
    solids.push(circle(x, y, 13, 'post', { bounce: 0.6 }));
  }

  /* --- inlane rollovers --------------------------------------------------- */
  sensors.push({ id: 'inlaneL', x: 168, y: 844, r: 20 });
  sensors.push({ id: 'inlaneR', x: 344, y: 844, r: 20 });

  /* --- flippers ----------------------------------------------------------- */
  const flippers = [
    makeFlipper({ x: 150, y: 878, len: 100, rest: 0.46, swing: -0.5, side: -1 }),
    makeFlipper({ x: 362, y: 878, len: 100, rest: Math.PI - 0.46, swing: Math.PI + 0.5, side: 1 }),
  ];

  return {
    solids,
    flippers,
    sensors,
    lamps,
    targets,
    bumpers,
    slingPlates,
    /** Where the ball waits for the plunger. */
    ballStart: { x: 519, y: 946 },
    plungerLane: { x0: 498, x1: 540, y: 946 },
    /** Below this the ball is gone. */
    drainY: 1004,
    /** A ball back down the plunger lane is not lost — you simply re-launch. */
    laneX0: 500,
  };
}

/** Point-in-polygon against the authored boundary. Used by the harness to prove
 *  the ball never escapes, and by nothing at runtime. */
export function insideTable(x, y) {
  let inside = false;
  for (let i = 0, j = BOUNDARY.length - 1; i < BOUNDARY.length; j = i++) {
    const [xi, yi] = BOUNDARY[i];
    const [xj, yj] = BOUNDARY[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

void arc;
