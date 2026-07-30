/*
 * Wave construction. Formations are laid out on a virtual grid so they scale
 * to any screen, and the wave list loops through nine attack patterns with a
 * boss every fifth wave.
 */

import { TAU, rand, chance, clamp, seededRandom } from './util.js';
import { Chicken, Asteroid, Boss, Mothership } from './enemies.js';

/* ASCII formation art: '#' normal chicken, 'o' brown, 'X' armoured. */
const SHAPES = {
  heart: [
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  arrow: [
    '...X...',
    '..###..',
    '.#####.',
    'o..#..o',
    '...#...',
    '...#...',
  ],
  skull: [
    '.#####.',
    '#.o.o.#',
    '#######',
    '.#####.',
    '.#.#.#.',
  ],
  egg: [
    '..###..',
    '.#####.',
    '#######',
    '#######',
    '.#o#o#.',
    '..###..',
  ],
  star: [
    '...X...',
    '.#####.',
    '#######',
    '..###..',
    '.##.##.',
    '#.....#',
  ],
  wings: [
    '##...##',
    '.##.##.',
    '..###..',
    '.#o.o#.',
    '##...##',
  ],
  invader: [
    '..#.#..',
    '.#####.',
    '##o#o##',
    '#######',
    '..#.#..',
    '.#...#.',
  ],
};

const SHAPE_KEYS = Object.keys(SHAPES);

const BREED_CHAR = { '#': 'white', o: 'brown', X: 'metal' };

/** Formation anchor: sways horizontally and bobs, all slots ride along. */
export class Formation {
  constructor(game) {
    this.game = game;
    this.configure({ cols: 7, rows: 5 });
  }

  configure({ cols = 7, rows = 5, swayAmp = 0.13, swaySpeed = 0.45, top = 0.15, descend = 0 } = {}) {
    const g = this.game;
    this.cols = cols;
    this.rows = rows;
    this.swayAmp = swayAmp;
    this.swaySpeed = swaySpeed;
    this.topFrac = top;
    this.descend = descend;
    this.t = 0;
    this.resize();
  }

  resize() {
    const g = this.game;
    this.cellW = Math.min((g.w * 0.86) / Math.max(1, this.cols), 52 * g.unit);
    this.cellH = Math.min(48 * g.unit, (g.h * 0.42) / Math.max(1, this.rows));
    this.cx = g.w * 0.5;
    this.top = g.h * this.topFrac;
    this.cy = this.top + (this.rows - 1) * this.cellH * 0.5;
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const amp = g.w * this.swayAmp;
    this.cx = g.w * 0.5 + Math.sin(this.t * this.swaySpeed * TAU * 0.35) * amp;
    this.top = g.h * this.topFrac + Math.sin(this.t * 0.9) * 6 * g.unit + this.descend * this.t * g.unit;
    this.cy = this.top + (this.rows - 1) * this.cellH * 0.5;
  }

  /** World position for a slot index; chickens carry their own slot data. */
  slotPos(index, chicken) {
    const s = chicken.slot || { cx: 0, cy: 0 };
    return {
      x: this.cx + s.cx * this.cellW,
      y: this.top + s.cy * this.cellH,
    };
  }
}

/* --------------------------------------------------------------- wave plan -- */

const WAVE_KINDS = [
  'grid',
  'shape',
  'flyby',
  'divers',
  'ring',
  'storm',
  'asteroids',
  'columns',
  'spiral',
];

const KIND_LABELS = {
  feast: 'FEAST TIME',
  grid: 'CHICKEN SQUADRON',
  shape: 'FLYING FORMATION',
  flyby: 'STRAFING RUN',
  divers: 'DIVE BOMBERS',
  ring: 'CAROUSEL OF DOOM',
  storm: 'CHICKEN STORM',
  asteroids: 'ASTEROID BELT',
  columns: 'MARCHING COLUMNS',
  spiral: 'SPIRAL ASSAULT',
  boss: 'BOSS FIGHT',
};

export class Wave {
  constructor(game, num) {
    this.game = game;
    this.num = num;
    this.time = 0;
    this.queue = []; // [{ t, spawn() }]
    this.spawned = 0;
    this.isBoss = num % 5 === 0;
    // Every seventh non-boss wave is a breather: food rains, nothing shoots.
    this.isFeast = !this.isBoss && num % 7 === 0;
    this.kind = this.isBoss
      ? 'boss'
      : this.isFeast
        ? 'feast'
        : WAVE_KINDS[(num - 1 - Math.floor((num - 1) / 5)) % WAVE_KINDS.length];
    this.label = KIND_LABELS[this.kind];
    this.rng = seededRandom(num * 9176 + 13);
    this.build();
  }

  push(t, spawn) {
    this.queue.push({ t, spawn });
  }

  get done() {
    return this.queue.length === 0;
  }

  /* -------------------------------------------------------------- builders -- */

  build() {
    const g = this.game;
    const n = this.num;
    const rng = this.rng;
    const tier = Math.floor((n - 1) / 5); // ramps every boss cycle

    switch (this.kind) {
      case 'boss':
        this.buildBoss();
        break;
      case 'feast':
        this.buildFeast();
        break;
      case 'grid': {
        const cols = clamp(5 + Math.floor(tier * 0.7), 5, 8);
        const rows = clamp(3 + Math.floor(tier * 0.5), 3, 5);
        g.formation.configure({ cols, rows, swayAmp: 0.12 + tier * 0.01 });
        let i = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const breed = r === 0 && tier > 0 && chance(0.35) ? 'metal' : chance(0.25 + tier * 0.05) ? 'brown' : 'white';
            const slot = { cx: c - (cols - 1) / 2, cy: r };
            this.push(i * 0.06, () =>
              this.chicken({
                breed,
                mode: 'slot',
                slot,
                enterFrom: { x: g.w * (c % 2 ? -0.1 : 1.1), y: g.h * 0.06 * (r + 1) },
                enterVia: { x: g.w * 0.5, y: -30 * g.unit },
              })
            );
            i += 1;
          }
        }
        break;
      }
      case 'shape': {
        const shape = SHAPES[SHAPE_KEYS[Math.floor(rng() * SHAPE_KEYS.length)]];
        const rows = shape.length;
        const cols = shape[0].length;
        g.formation.configure({ cols, rows, swayAmp: 0.1, top: 0.14 });
        let i = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const ch = shape[r][c];
            if (!BREED_CHAR[ch]) continue;
            const slot = { cx: c - (cols - 1) / 2, cy: r };
            const breed = ch === 'X' && tier === 0 ? 'brown' : BREED_CHAR[ch];
            this.push(i * 0.05, () =>
              this.chicken({
                breed,
                mode: 'slot',
                slot,
                enterFrom: { x: g.w * 0.5, y: -60 * g.unit },
                enterVia: { x: g.w * (c < cols / 2 ? 0.1 : 0.9), y: g.h * 0.1 },
                enterDur: rand(1.6, 1.1),
              })
            );
            i += 1;
          }
        }
        break;
      }
      case 'flyby': {
        // Streams of chickens crossing the screen in sine paths.
        const streams = 3 + Math.min(3, tier);
        const perStream = 5 + Math.min(5, tier);
        for (let s = 0; s < streams; s++) {
          const dir = s % 2 ? -1 : 1;
          const y = g.h * (0.12 + 0.075 * s);
          const breed = s === streams - 1 && tier > 1 ? 'metal' : chance(0.3) ? 'brown' : 'white';
          for (let i = 0; i < perStream; i++) {
            this.push(s * 0.9 + i * 0.36, () =>
              this.chicken({
                breed,
                mode: 'sine',
                x: dir > 0 ? -40 * g.unit : g.w + 40 * g.unit,
                y,
                dir,
                speed: 130 + tier * 12,
                amp: 34 + s * 8,
                freq: 1.1 + s * 0.2,
              })
            );
          }
        }
        break;
      }
      case 'divers': {
        const cols = clamp(5 + Math.floor(tier * 0.6), 5, 8);
        const rows = 3;
        g.formation.configure({ cols, rows, swayAmp: 0.08, swaySpeed: 0.6 });
        let i = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const slot = { cx: c - (cols - 1) / 2, cy: r };
            this.push(i * 0.07, () =>
              this.chicken({
                breed: chance(0.3 + tier * 0.05) ? 'brown' : 'white',
                mode: 'dive',
                slot,
                diveDelay: rand(9, 2) - Math.min(4, tier),
                enterFrom: { x: g.w * 0.5, y: -50 * g.unit },
              })
            );
            i += 1;
          }
        }
        break;
      }
      case 'ring': {
        const count = 8 + Math.min(8, tier * 2);
        g.formation.configure({ cols: 6, rows: 4, swayAmp: 0.09, top: 0.2 });
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * TAU;
          this.push(i * 0.08, () =>
            this.chicken({
              breed: i % 4 === 0 ? 'brown' : 'white',
              mode: 'orbit',
              angle,
              orbitR: 100 + Math.min(40, tier * 6),
              orbitSpeed: 0.55 + tier * 0.05,
              enterFrom: { x: g.w * 0.5, y: -50 * g.unit },
            })
          );
        }
        break;
      }
      case 'spiral': {
        const rings = 2 + Math.min(2, Math.floor(tier / 2));
        for (let ring = 0; ring < rings; ring++) {
          const count = 7 + ring * 3;
          for (let i = 0; i < count; i++) {
            const angle = (i / count) * TAU + ring * 0.5;
            this.push(ring * 0.7 + i * 0.07, () =>
              this.chicken({
                breed: ring === 0 ? 'brown' : 'white',
                mode: 'orbit',
                angle,
                orbitR: 60 + ring * 52,
                orbitSpeed: (ring % 2 ? -1 : 1) * (0.7 - ring * 0.12 + tier * 0.04),
                enterFrom: { x: g.w * 0.5, y: -50 * g.unit },
              })
            );
          }
        }
        g.formation.configure({ cols: 6, rows: 4, swayAmp: 0.07, top: 0.24 });
        break;
      }
      case 'storm': {
        // Endless-feeling rain of chickens; count is fixed so it can be cleared.
        const count = 20 + Math.min(30, tier * 5);
        for (let i = 0; i < count; i++) {
          this.push(i * (0.42 - Math.min(0.2, tier * 0.03)), () =>
            this.chicken({
              breed: chance(0.18) ? 'brown' : chance(0.12) ? 'chick' : 'white',
              mode: 'fall',
              x: rand(g.w * 0.92, g.w * 0.08),
              y: -30 * g.unit,
              speed: 95 + tier * 10,
              sway: rand(60, 20),
            })
          );
        }
        break;
      }
      case 'columns': {
        const cols = 4;
        const rows = 5 + Math.min(3, tier);
        g.formation.configure({ cols, rows, swayAmp: 0.2, swaySpeed: 0.8, top: 0.1 });
        let i = 0;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const slot = { cx: (c - (cols - 1) / 2) * 1.5, cy: r * 0.85 };
            this.push(i * 0.05, () =>
              this.chicken({
                breed: r === rows - 1 ? 'metal' : chance(0.3) ? 'brown' : 'white',
                mode: 'slot',
                slot,
                enterFrom: { x: g.w * (c / (cols - 1)), y: -60 * g.unit - r * 30 * g.unit },
              })
            );
            i += 1;
          }
        }
        break;
      }
      case 'asteroids': {
        const count = 14 + Math.min(22, tier * 4);
        for (let i = 0; i < count; i++) {
          this.push(i * (0.55 - Math.min(0.3, tier * 0.04)), () => {
            const big = chance(0.62);
            this.game.addEnemy(
              new Asteroid(this.game, {
                big,
                x: rand(this.game.w * 0.92, this.game.w * 0.08),
                y: -30 * this.game.unit,
              })
            );
          });
        }
        // A few chickens ride along with the rocks.
        for (let i = 0; i < 4 + Math.min(6, tier); i++) {
          this.push(2 + i * 1.4, () =>
            this.chicken({
              breed: 'white',
              mode: 'sine',
              x: chance(0.5) ? -40 * g.unit : g.w + 40 * g.unit,
              y: g.h * rand(0.28, 0.12),
              dir: chance(0.5) ? 1 : -1,
              speed: 150,
              amp: 40,
            })
          );
        }
        break;
      }
    }

    this.total = this.queue.length;
  }

  /**
   * Bonus wave: a shower of drumsticks and gifts plus a handful of harmless
   * chickens that always drop food. Nothing lays eggs.
   */
  buildFeast() {
    const g = this.game;
    const tier = Math.floor((this.num - 1) / 5);
    const treats = 26 + Math.min(14, tier * 3);
    for (let i = 0; i < treats; i++) {
      this.push(0.3 + i * 0.28, () => {
        const x = rand(g.w * 0.9, g.w * 0.1);
        g.spawnPickup(x, -20 * g.unit, chance(0.12) ? g.rollGift() : 'food');
      });
    }
    // A few plump chickens to shoot for extra drumsticks.
    for (let i = 0; i < 6; i++) {
      this.push(1 + i * 1.15, () =>
        this.chicken({
          breed: chance(0.4) ? 'brown' : 'white',
          mode: 'fall',
          x: rand(g.w * 0.86, g.w * 0.14),
          y: -30 * g.unit,
          speed: 62,
          sway: 34,
          canLay: false,
          feast: true,
        })
      );
    }
  }

  buildBoss() {
    const g = this.game;
    const n = this.num;
    this.push(0.4, () => {
      // Bosses alternate between the giant hen and the chicken mothership.
      const Kind = Math.floor(n / 5) % 2 === 1 ? Boss : Mothership;
      const boss = new Kind(g, n);
      g.addEnemy(boss);
      g.boss = boss;
    });
    // Escort chickens circling the boss.
    const escorts = 4 + Math.min(8, Math.floor(n / 5) * 2);
    g.formation.configure({ cols: 6, rows: 3, swayAmp: 0.1, top: 0.32 });
    for (let i = 0; i < escorts; i++) {
      this.push(1.6 + i * 0.14, () =>
        this.chicken({
          breed: i % 3 === 0 ? 'brown' : 'white',
          mode: 'orbit',
          angle: (i / escorts) * TAU,
          orbitR: 120,
          orbitSpeed: 0.75,
          enterFrom: { x: g.w * 0.5, y: -40 * g.unit },
        })
      );
    }
  }

  chicken(opts) {
    const c = new Chicken(this.game, opts);
    c.slot = opts.slot || null;
    this.game.addEnemy(c);
    return c;
  }

  /* ---------------------------------------------------------------- update -- */

  update(dt) {
    this.time += dt;
    while (this.queue.length && this.queue[0].t <= this.time) {
      const item = this.queue.shift();
      item.spawn();
      this.spawned += 1;
    }
  }
}

/*
 * Difficulty modes. Each one scales the per-wave curve below and sets the
 * starting loadout; harder modes pay more score.
 */
export const DIFFICULTIES = {
  rookie: {
    id: 'rookie',
    badge: 'ROOKIE',
    name: 'Rookie',
    short: 'ROOKIE',
    blurb: 'Slower eggs, five ships. Learn the ropes.',
    lives: 5,
    missiles: 5,
    hp: 0.72,
    speed: 0.86,
    layRate: 0.6,
    eggSpeed: 0.84,
    bossHp: 0.7,
    bossRate: 0.8,
    scoreMul: 0.7,
  },
  veteran: {
    id: 'veteran',
    badge: 'VET',
    name: 'Veteran',
    short: 'VETERAN',
    blurb: 'The fight as intended. Three ships.',
    lives: 3,
    missiles: 3,
    hp: 1,
    speed: 1,
    layRate: 1,
    eggSpeed: 1,
    bossHp: 1,
    bossRate: 1,
    scoreMul: 1,
  },
  superstar: {
    id: 'superstar',
    badge: 'STAR',
    name: 'Superstar',
    short: 'SUPERSTAR',
    blurb: 'Tougher, faster, two ships. Big points.',
    lives: 2,
    missiles: 2,
    hp: 1.45,
    speed: 1.16,
    layRate: 1.5,
    eggSpeed: 1.18,
    bossHp: 1.35,
    bossRate: 1.25,
    scoreMul: 1.6,
  },
};

export const DEFAULT_DIFFICULTY = 'veteran';

export function difficultyMode(id) {
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/** Difficulty curve: wave number times the chosen mode's multipliers. */
export function difficultyFor(wave, mode = DIFFICULTIES[DEFAULT_DIFFICULTY]) {
  const t = wave - 1;
  return {
    hp: (1 + t * 0.16) * mode.hp,
    speed: clamp(1 + t * 0.022, 1, 1.85) * mode.speed,
    layRate: clamp(1 + t * 0.05, 1, 2.6) * mode.layRate,
    eggSpeed: clamp(1 + t * 0.018, 1, 1.7) * mode.eggSpeed,
    bossHp: (1 + t * 0.05) * mode.bossHp,
    bossRate: clamp(1 + t * 0.02, 1, 1.7) * mode.bossRate,
  };
}
