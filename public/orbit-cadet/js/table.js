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
 *
 * ---------------------------------------------------------------------------
 * THE ONE RULE THIS TABLE IS BUILT AROUND: THE ONLY WAY TO LOSE A BALL IS
 * THROUGH THE GATE BETWEEN THE FLIPPER TIPS.
 *
 * The first cut of the lower third had wide-open outlanes either side of the
 * flippers. Measured with no player input, 57% of launches drained down the
 * right and only 43% ever came within a flipper's reach; median time alive was
 * 2.3 seconds. That is not difficulty, it is the table refusing to deal you in.
 *
 * So the bottom of the table is now a pair of funnels whose walls converge to
 * within a ball's width of each flipper pivot. A ball down either side is
 * *delivered onto the flipper*. Nothing fits between a pivot and the wall beside
 * it, and oc-space.mjs proves it by flood-filling the free space and checking
 * that the only reachable exit is the central gate.
 * ---------------------------------------------------------------------------
 */

import { seg, arc, circle, wall, chain, makeFlipper, TABLE_W, TABLE_H } from './physics.js';

export { TABLE_W, TABLE_H };

/* --- The outer boundary --------------------------------------------------
 * Clockwise from the drain's left lip: up the left funnel, up the left side,
 * over the dome, down the right into the plunger lane, and back along the
 * bottom. The closing edge is the drain mouth: it is part of the polygon so the
 * containment test is closed, but no wall is generated for it.
 */
export const BOUNDARY = [
  [232, 1000], // drain mouth, left lip
  [160, 874], // ...the funnel's approach, ending flush against the left pivot
  [110, 856],
  [56, 800],
  [20, 700],
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
  [498, 1000], // plunger lane floor, flush with the lane's inner wall
  [328, 1000], // drain mouth, right lip
];

/* Every boundary edge becomes a wall except the closing one, which is the open
 * drain mouth — it must close the polygon for the containment test but must not
 * become a wall, or nothing could ever drain. Derived rather than written down,
 * so editing the boundary cannot silently wall the drain shut. */
const DOME_END = BOUNDARY.length - 1;

/* Flippers. The gate between the tips at rest is 43.6 units wide against a
 * 22-unit ball: a ball and a bit, which is what a real table leaves. Every other
 * exit is closed, so this gap is the entire difficulty of not losing a ball. */
const PIVOT_L = { x: 168, y: 878 };
const PIVOT_R = { x: 392, y: 878 };
const FLIP_LEN = 100;
const FLIP_REST = 0.46;

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
    // The dome and the funnels are chrome guides; the rest is playfield wall.
    const metal = (i >= 5 && i <= 14) || i <= 3;
    solids.push(wall(a[0], a[1], b[0], b[1], metal ? 'metal' : 'wall', 5));
  }

  /* --- the plunger lane and the right funnel -------------------------------
   * The lane's inner wall doubles as the right edge of the playfield. It stops
   * short at the top so a launched ball climbs out into the dome, and below the
   * lane it becomes the right funnel, converging on the right flipper pivot.
   */
  /* The lane's upper end curves left, the way a real launch ramp does. Straight,
   * it fired the ball vertically at the top of the dome, whence it fell straight
   * back down the lane again: 47 of 240 launches never entered play at all and
   * simply asked to be re-plunged. Curved, every launch is delivered into the top
   * channel heading left, and the plunger decides how fast. */
  solids.push(
    ...chain(
      [
        [498, 770],
        [498, 330],
        [492, 258],
        [467, 198],
        [448, 172],
      ],
      'metal',
      5
    )
  );
  /* The lane is a closed shaft all the way to its floor. Without this wall the
   * lane merged into the apron below the funnel, and a ball that fell back down
   * the lane rolled left out of it and settled at (490, 984) — left of laneX0, so
   * no re-plunge, and above drainY, so no drain either. It sat there for the rest
   * of the game. */
  solids.push(wall(498, 770, 498, 1000, 'metal', 5));
  solids.push(wall(498, 770, 450, 856, 'metal', 5));
  solids.push(wall(450, 856, 400, 874, 'metal', 5));
  solids.push(wall(400, 874, 328, 1000, 'wall', 5));

  /* --- the left orbit lane -------------------------------------------------
   * An inner guide running parallel to the left wall. A ball shot up here
   * follows it round and is spat into the top channel — the orbit shot, entirely
   * under its own momentum.
   */
  const orbitGuide = [
    /* The lane's mouth sits at the top of the left funnel, level with the corner
     * where the outer wall turns. Any higher and a ball flipped up the left side
     * is deflected off the funnel wall before it ever finds the entrance — with
     * the mouth at y=620 the reach harness put 0 of 84 flipper shots up the
     * orbit, which quietly broke one of the four missions. */
    [86, 706],
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

  /* --- the top channel, and the three fuel lanes ---------------------------
   * A guide parallel to the inside of the dome turns the top of the table into a
   * channel with three rollovers in it. Both the orbit shot and a full-power
   * plunge run through it, which is what makes a hard launch worth something:
   * the ball comes back down the far side having lit a lane.
   */
  const domeGuide = [
    [180, 150],
    [246, 118],
    [292, 106],
    [338, 118],
    [404, 138],
  ];
  solids.push(...chain(domeGuide, 'metal', 5));
  const fuelLanes = [
    { x: 208, y: 104 },
    { x: 292, y: 84 },
    { x: 372, y: 102 },
  ];
  for (let i = 0; i < fuelLanes.length; i++) {
    sensors.push({ id: `fuel${i}`, x: fuelLanes[i].x, y: fuelLanes[i].y, r: 26, fuel: i });
    lamps.push({ x: fuelLanes[i].x, y: fuelLanes[i].y, r: 9, kind: 'fuel', i });
  }

  /* --- pop bumpers ---------------------------------------------------------
   * `kick` is what makes these bumpers rather than posts: they add energy
   * instead of returning a fraction of it. Which is also why the number is
   * restrained — at 620 apiece, the three of them put in more than the table's
   * drag and restitution took out, and balls bounced around up here for
   * forty-five seconds without ever coming down.
   */
  const bumpers = [
    { x: 280, y: 360, r: 27 },
    { x: 226, y: 450, r: 27 },
    { x: 334, y: 450, r: 27 },
  ];
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    solids.push(circle(b.x, b.y, b.r, 'rubber', { kick: 300, bumper: i, bounce: 0.5 }));
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
   * units clear, which turns the space behind it into a passable lane.
   */
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const ty = 296 + i * 74;
    const t = seg(396, ty, 434, ty + 26, 'dead', { target: i, bounce: 0.2 });
    t.thick = 5;
    solids.push(t);
    targets.push(t);
    lamps.push({ x: 374, y: ty + 13, r: 8, kind: 'target', i });
  }
  // A sloped feed above the bank. Never horizontal: a flat ledge inside the
  // table is a shelf the ball can rest on forever, since "downhill" here is
  // always +y.
  solids.push(wall(372, 236, 448, 262, 'metal', 5));

  /* --- mission selector and spinner ---------------------------------------
   * The selector is a rollover sensor, not a post. As a post it sat 14 units
   * off the orbit guide and trapped the ball; every position that cleared the
   * guide then pinched against a bumper instead. A sensor has no collision
   * geometry, so it cannot pinch against anything — and rolling over a target
   * to arm a mission is what a real table does anyway.
   */
  sensors.push({ id: 'selector', x: 128, y: 420, r: 22, label: 'MISSION' });
  lamps.push({ x: 128, y: 420, r: 15, kind: 'selector' });
  sensors.push({ id: 'spinner', x: 280, y: 610, r: 26, label: 'SPINNER' });
  lamps.push({ x: 280, y: 610, r: 22, kind: 'spinner' });

  /* --- kickers (slingshots) ------------------------------------------------
   * The rubber triangles above each flipper. Without them the lower playfield is
   * dead and a ball trickles quietly to the drain. Closed triangles, because an
   * open V is a wedge with a kicker on both faces — a ball that got inside one
   * never came out.
   *
   * Only the long upper face kicks. The lower face is the roof of the inlane and
   * a kick there would fire the ball at the drain.
   */
  const slingPlates = [];
  const sling = (pts, side) => {
    slingPlates.push(pts);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const w = wall(a[0], a[1], b[0], b[1], 'rubber', 5);
      w.sling = side;
      if (i === 0) w.kick = 300;
      else w.bounce = 0.5;
      solids.push(w);
    }
  };
  sling([[132, 720], [204, 788], [144, 812]], 'L');
  sling([[428, 720], [356, 788], [416, 812]], 'R');
  lamps.push({ x: 158, y: 766, r: 9, kind: 'sling', side: 'L' });
  lamps.push({ x: 402, y: 766, r: 9, kind: 'sling', side: 'R' });

  /* --- posts -------------------------------------------------------------- */
  for (const [x, y] of [[220, 600], [340, 600], [130, 540], [430, 540]]) {
    solids.push(circle(x, y, 13, 'post', { bounce: 0.6 }));
  }


  /* --- inlane rollovers ---------------------------------------------------
   * In the mouth of each funnel, where the ball is on its way to the flipper.
   */
  sensors.push({ id: 'inlaneL', x: 148, y: 838, r: 20 });
  sensors.push({ id: 'inlaneR', x: 412, y: 838, r: 20 });
  lamps.push({ x: 148, y: 838, r: 7, kind: 'inlane', side: 'L' });
  lamps.push({ x: 412, y: 838, r: 7, kind: 'inlane', side: 'R' });

  /* --- flippers ----------------------------------------------------------- */
  const flippers = [
    makeFlipper({ x: PIVOT_L.x, y: PIVOT_L.y, len: FLIP_LEN, rest: FLIP_REST, swing: -0.5, side: -1 }),
    makeFlipper({
      x: PIVOT_R.x,
      y: PIVOT_R.y,
      len: FLIP_LEN,
      rest: Math.PI - FLIP_REST,
      swing: Math.PI + 0.5,
      side: 1,
    }),
  ];

  return {
    solids,
    flippers,
    sensors,
    lamps,
    targets,
    bumpers,
    slingPlates,
    domeGuide,
    orbitGuide,
    fuelLanes,
    /** Where the ball waits for the plunger. */
    ballStart: { x: 519, y: 946 },
    plungerLane: { x0: 498, x1: 540, y: 946 },
    /** Below this the ball is gone. */
    drainY: 1004,
    /** A ball back down the plunger lane is not lost — you simply re-launch. */
    laneX0: 500,
    decor: decor(),
  };
}

/* --- Playfield art ---------------------------------------------------------
 * Where the decals live. Kept beside the geometry on purpose: a label that says
 * ORBIT has to sit on the actual orbit lane, and a chevron pointing up a lane
 * has to point up the lane that is there. Consumed by game.js, which bakes the
 * whole lot into one offscreen canvas at startup.
 */
function decor() {
  return {
    /** Wide translucent channels under the shots, so each one reads as a lane. */
    lanes: [
      { path: [[48, 640], [50, 470], [70, 360], [116, 258], [186, 196], [262, 172]], w: 46 },
      { path: [[210, 126], [280, 94], [364, 96], [428, 128]], w: 44 },
      { path: [[519, 930], [519, 320], [513, 254], [488, 196], [470, 172]], w: 42 },
      { path: [[128, 820], [152, 856], [180, 872]], w: 34 },
      { path: [[432, 820], [408, 856], [380, 872]], w: 34 },
      { path: [[462, 300], [470, 240]], w: 36 },
    ],
    /** Chevrons showing which way each lane shoots. */
    arrows: [
      { x: 48, y: 600, rot: -Math.PI / 2, n: 3 },
      { x: 519, y: 700, rot: -Math.PI / 2, n: 3 },
      { x: 140, y: 828, rot: 0.95, n: 2 },
      { x: 420, y: 828, rot: Math.PI - 0.95, n: 2 },
    ],
    /** Thin line-art panels, the angular sort the original's playfield is full of. */
    panels: [
      { pts: [[372, 274], [462, 274], [462, 496], [372, 496]], color: 'rgba(120,206,255,0.30)' },
      { pts: [[176, 330], [280, 288], [384, 330], [384, 500], [280, 542], [176, 500]], color: 'rgba(120,206,255,0.18)' },
      { pts: [[96, 632], [196, 632], [196, 684], [96, 684]], color: 'rgba(120,206,255,0.16)' },
      { pts: [[364, 632], [464, 632], [464, 684], [364, 684]], color: 'rgba(120,206,255,0.16)' },
    ],
    /** The wormhole: concentric rings behind the bumper cluster. */
    rings: [
      { x: 280, y: 414, r: 150 },
      { x: 280, y: 414, r: 118 },
      { x: 280, y: 414, r: 86 },
    ],
    labels: [
      { x: 280, y: 702, text: 'ORBIT CADET', size: 22, color: 'rgba(120,206,255,0.4)', track: 3 },
      { x: 280, y: 724, text: 'SPACE COMMAND · TABLE 01', size: 9, color: 'rgba(120,206,255,0.3)', track: 2 },
      { x: 48, y: 664, text: 'ORBIT', size: 13, color: 'rgba(255,194,74,0.8)', rot: -Math.PI / 2 },
      { x: 519, y: 560, text: 'DEPLOYMENT CHUTE', size: 12, color: 'rgba(120,206,255,0.55)', rot: -Math.PI / 2 },
      { x: 415, y: 284, text: 'TARGET BANK', size: 10, color: 'rgba(120,206,255,0.5)' },
      { x: 292, y: 150, text: 'FUEL', size: 12, color: 'rgba(255,194,74,0.7)', track: 4 },
      { x: 146, y: 646, text: 'BONUS', size: 11, color: 'rgba(120,206,255,0.55)', track: 2 },
      { x: 414, y: 646, text: 'RANK', size: 11, color: 'rgba(120,206,255,0.55)', track: 2 },
      { x: 128, y: 452, text: 'MISSION', size: 11, color: 'rgba(78,240,160,0.7)', track: 2 },
      { x: 280, y: 646, text: 'SPINNER', size: 10, color: 'rgba(120,206,255,0.5)', track: 2 },
    ],
    /** Bar inserts in the two lower panels: bonus multiplier and rank ladder. */
    bars: [
      { x: 104, y: 656, w: 84, h: 12, kind: 'bonus' },
      { x: 372, y: 656, w: 84, h: 12, kind: 'rank' },
    ],
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
