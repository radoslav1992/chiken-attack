import {
  MAPS,
  TOWERS,
  CAPTAINS,
  ENEMIES,
  PERKS,
  CAMPAIGN_WAVES,
  dailyConfig,
  validDay,
  hash,
} from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function routePoint(route, distance) {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1],
      [bx, by] = route[i];
    const length = Math.hypot(bx - ax, by - ay);
    if (left <= length)
      return {
        x: ax + ((bx - ax) * left) / length,
        y: ay + ((by - ay) * left) / length,
        done: false,
      };
    left -= length;
  }
  const [x, y] = route.at(-1);
  return { x, y, done: true };
}
export function routeLength(route) {
  return route
    .slice(1)
    .reduce(
      (sum, point, i) =>
        sum + Math.hypot(point[0] - route[i][0], point[1] - route[i][1]),
      0,
    );
}
export function wavePlan(seed, map, wave) {
  let rng = hash(`${seed}:${map}:${wave}`);
  const random = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const count = Math.min(85, 5 + wave * 2 + map * 2);
  const queue = [];
  for (let i = 0; i < count; i++) {
    const r = random();
    let type =
      wave >= 5 && r < 0.22
        ? 'heron'
        : wave >= 3 && r < 0.47
          ? 'boar'
          : wave >= 2 && r < 0.7
            ? 'runner'
            : 'raider';
    queue.push({
      type,
      lane: Math.floor(random() * MAPS[map].paths.length),
      boss: false,
    });
  }
  if (wave % 6 === 0)
    queue.splice(Math.floor(count / 2), 0, {
      type: MAPS[map].bossType,
      lane: 0,
      boss: true,
    });
  return queue;
}

export class Game {
  constructor() {
    this.state = null;
    this.hooks = {};
  }
  on(event, fn) {
    (this.hooks[event] ||= []).push(fn);
  }
  emit(event, data) {
    for (const fn of this.hooks[event] || []) fn(data);
  }
  newRun(config = {}) {
    const daily = validDay(config.daily) ? dailyConfig(config.daily) : null;
    const c = daily || config;
    const captain = CAPTAINS.some((x) => x.id === c.captain)
      ? c.captain
      : 'moss';
    const hp = captain === 'moss' ? 120 : 100;
    this.state = {
      v: 1,
      seed: (c.seed ?? 1) >>> 0,
      map: clamp(Math.floor(c.map) || 0, 0, 2),
      captain,
      daily: daily?.daily || null,
      phase: 'build',
      paused: false,
      endless: false,
      wave: 0,
      wood: 170,
      hp,
      maxHp: hp,
      water: 100,
      maxWater: 100,
      score: 0,
      kills: 0,
      floods: 0,
      totalWood: 170,
      waveLeaks: 0,
      elapsed: 0,
      waveTime: 0,
      floodTimer: 0,
      floodCooldown: 0,
      towers: [],
      enemies: [],
      queue: [],
      spawnIn: 0,
      seq: 0,
      perks: {},
      choices: [],
      effects: [],
      message:
        'Build two Acorn turrets near the trail, then send the first wave.',
      id: String(config.id || `dam-run-${(c.seed ?? 1) >>> 0}`),
      victoryScore: null,
    };
    this.emit('change');
    this.emit('save');
    return this.state;
  }
  perk(id) {
    return this.state?.perks[id] || 0;
  }
  buildCost(type) {
    return TOWERS[type]
      ? TOWERS[type].cost -
          (type === 'acorn' && this.state.captain === 'pip' ? 15 : 0)
      : Infinity;
  }
  stats(tower) {
    const def = TOWERS[tower.type],
      path = tower.branch;
    return {
      damage:
        def.damage *
        (1 + (tower.level - 1) * 0.6) *
        (tower.type === 'acorn' ? 1 + this.perk('sharp') * 0.25 : 1) *
        (path === 'power' ? 1.55 : 1),
      range:
        def.range *
        (1 + this.perk('long') * 0.15) *
        (path === 'reach' ? 1.3 : 1),
      rate:
        def.rate /
        (1 + this.perk('quick') * 0.15) /
        (path === 'reach' ? 1.15 : 1),
    };
  }
  build(pad, type) {
    const s = this.state;
    if (
      !s ||
      s.phase !== 'build' ||
      s.paused ||
      !Object.hasOwn(TOWERS, type) ||
      !Number.isInteger(pad) ||
      !MAPS[s.map].pads[pad] ||
      s.towers.some((t) => t.pad === pad)
    )
      return false;
    const cost = this.buildCost(type);
    if (s.wood < cost) return false;
    s.wood -= cost;
    s.towers.push({
      pad,
      type,
      level: 1,
      branch: null,
      spent: cost,
      cooldown: 0,
    });
    s.message = `${TOWERS[type].name} ready. Select it to upgrade or sell.`;
    this.emit('change');
    this.emit('save');
    return true;
  }
  upgradeCost(tower) {
    return Math.round(
      TOWERS[tower.type].cost * (tower.level === 1 ? 0.9 : 1.4),
    );
  }
  upgrade(pad, branch = null) {
    const s = this.state,
      t = s?.towers.find((t) => t.pad === pad);
    if (
      !t ||
      s.phase !== 'build' ||
      s.paused ||
      t.level >= 3 ||
      (t.level === 2 && !['power', 'reach'].includes(branch))
    )
      return false;
    const cost = this.upgradeCost(t);
    if (s.wood < cost) return false;
    s.wood -= cost;
    t.spent += cost;
    t.level++;
    if (t.level === 3) t.branch = branch;
    s.message = `${TOWERS[t.type].name} upgraded to level ${t.level}.`;
    this.emit('change');
    this.emit('save');
    return true;
  }
  sell(pad) {
    const s = this.state,
      index = s?.towers.findIndex((t) => t.pad === pad);
    if (!s || s.phase !== 'build' || s.paused || index < 0) return false;
    s.wood += Math.floor(s.towers[index].spent * 0.7);
    s.towers.splice(index, 1);
    s.message = 'Tower salvaged. 70% of its wood returned.';
    this.emit('change');
    this.emit('save');
    return true;
  }
  repair() {
    const s = this.state;
    if (!s || s.phase !== 'build' || s.paused || s.hp >= s.maxHp || s.wood < 40)
      return false;
    s.wood -= 40;
    s.hp = Math.min(s.maxHp, s.hp + 30);
    s.message = 'Fresh logs in the dam. +30 strength.';
    this.emit('change');
    this.emit('save');
    return true;
  }
  startWave() {
    const s = this.state;
    if (
      !s ||
      s.phase !== 'build' ||
      s.paused ||
      !s.towers.some((t) => t.type !== 'mill')
    )
      return false;
    s.wave++;
    s.waveTime = 0;
    s.waveLeaks = 0;
    s.phase = 'battle';
    s.queue = wavePlan(s.seed, s.map, s.wave);
    s.spawnIn = 0.25;
    s.water = Math.min(s.maxWater, s.water + 15);
    s.effects = [];
    s.message =
      s.wave % 6 === 0
        ? `${MAPS[s.map].boss} approaches. Save water for the ground raiders!`
        : `Wave ${s.wave}. Hold your water until the enemy packs together.`;
    this.emit('wave');
    this.emit('change');
    this.emit('save');
    return true;
  }
  route(enemy) {
    if (enemy.flying) {
      const start = MAPS[this.state.map].paths[enemy.lane][0];
      return [start, [480, 532]];
    }
    return MAPS[this.state.map].paths[enemy.lane];
  }
  spawn(spec) {
    const s = this.state,
      def = ENEMIES[spec.type];
    const scale =
      (1 + (s.wave - 1) * 0.24) *
      (1 + s.map * 0.05) *
      Math.pow(1.14, Math.min(100, Math.max(0, s.wave - 12)));
    const hp = Math.round(
      def.hp * scale * (spec.boss ? (s.wave % 12 === 0 ? 18 : 10) : 1),
    );
    const enemy = {
      ...spec,
      id: ++s.seq,
      hp,
      maxHp: hp,
      distance: 0,
      age: 0,
      slow: 0,
      flying: !!def.flying,
      speed: def.speed * (spec.boss ? 0.62 : 1),
      damage: def.damage * (spec.boss ? 3 : 1),
      reward: spec.boss ? 70 : def.reward,
      armour: def.armour,
      shield: false,
      summoned: false,
    };
    Object.assign(enemy, routePoint(this.route(enemy), 0));
    s.enemies.push(enemy);
  }
  hit(enemy, damage, piercing = false) {
    if (enemy.hp <= 0) return;
    const armour = piercing ? 0 : enemy.shield ? 0.8 : enemy.armour;
    enemy.hp -= Math.max(1, damage * (1 - armour));
    if (enemy.hp <= 0) {
      const s = this.state,
        wood = enemy.reward + this.perk('salvage') * 2;
      s.wood += wood;
      s.totalWood += wood;
      s.kills++;
      s.score = Math.min(
        100000000,
        s.score + (enemy.boss ? 800 : 25) + s.wave * 3,
      );
      s.effects.push({
        kind: 'pop',
        x: enemy.x,
        y: enemy.y,
        life: 0.45,
        max: 0.45,
        colour: '#ffe4a1',
      });
    }
  }
  flood() {
    const s = this.state;
    if (
      !s ||
      s.phase !== 'battle' ||
      s.paused ||
      s.water < 40 ||
      s.floodCooldown > 0
    )
      return false;
    s.water -= 40;
    s.floods++;
    s.floodTimer = 1.3;
    s.floodCooldown = 5;
    const damage = (55 + s.wave * 5) * (1 + this.perk('torrent') * 0.35);
    for (const e of s.enemies) {
      if (e.flying || e.hp <= 0) continue;
      this.hit(e, damage, true);
      e.distance = Math.max(0, e.distance - (e.boss ? 20 : 70));
      e.slow = Math.max(e.slow, e.boss ? 0.7 : 2);
      Object.assign(e, routePoint(this.route(e), e.distance));
    }
    s.message =
      s.water < 25
        ? 'Low reservoir! The dam takes 50% more damage below 25 water.'
        : 'WHOOSH! Ground raiders swept back. Flying herons stay above the flood.';
    this.emit('flood');
    this.emit('change');
    this.emit('save');
    return true;
  }
  update(dt) {
    const s = this.state;
    if (
      !s ||
      s.paused ||
      s.phase !== 'battle' ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    // Simulation uses bounded substeps, so fast-forward never skips the towers.
    let remaining = Math.min(dt, 0.3);
    while (remaining > 0.00001 && s.phase === 'battle') {
      const step = Math.min(1 / 30, remaining);
      this.step(step);
      remaining -= step;
    }
  }
  step(dt) {
    const s = this.state;
    s.elapsed += dt;
    s.waveTime += dt;
    s.spawnIn -= dt;
    s.floodTimer = Math.max(0, s.floodTimer - dt);
    s.floodCooldown = Math.max(0, s.floodCooldown - dt);
    const mills = s.towers.filter((t) => t.type === 'mill');
    s.water = Math.min(
      s.maxWater,
      s.water +
        dt *
          (0.7 +
            mills.reduce(
              (n, t) => n + 0.2 * t.level * (t.branch === 'reach' ? 2 : 1),
              0,
            )),
    );
    if (s.spawnIn <= 0 && s.queue.length) {
      this.spawn(s.queue.shift());
      s.spawnIn += Math.max(0.38, 0.95 - s.wave * 0.025);
    }
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      e.age += dt;
      e.slow = Math.max(0, e.slow - dt);
      e.shield = e.boss && e.type === 'boar' && e.age % 8 < 3;
      // Bristle brings one boarding party; Stormwing alternates gliding and diving.
      if (e.boss && e.type === 'raider' && e.age > 8 && !e.summoned) {
        e.summoned = true;
        for (let i = 0; i < 4; i++)
          s.queue.push({
            type: 'runner',
            lane: i % MAPS[s.map].paths.length,
            boss: false,
          });
      }
      const dive = e.boss && e.flying && e.age % 9 > 6 ? 1.6 : 1;
      e.distance +=
        e.speed * dive * dt * (e.slow > 0 ? (e.boss ? 0.8 : 0.48) : 1);
      Object.assign(e, routePoint(this.route(e), e.distance));
      if (e.done) {
        s.hp = Math.max(
          0,
          s.hp - Math.ceil(e.damage * (s.water < 25 ? 1.5 : 1)),
        );
        s.waveLeaks++;
        e.hp = 0;
        s.effects.push({
          kind: 'hurt',
          x: 480,
          y: 532,
          life: 0.6,
          max: 0.6,
          colour: '#e27056',
        });
        this.emit('hurt');
      }
    }
    if (s.hp <= 0) {
      this.finish(false);
      return;
    }
    for (const tower of s.towers) {
      if (tower.type === 'mill') continue;
      tower.cooldown = Math.max(0, tower.cooldown - dt);
      if (tower.cooldown > 0) continue;
      const [x, y] = MAPS[s.map].pads[tower.pad],
        stats = this.stats(tower);
      const targets = s.enemies.filter(
        (e) =>
          e.hp > 0 &&
          (!(tower.type === 'log' || tower.type === 'bramble') || !e.flying) &&
          Math.hypot(e.x - x, e.y - y) <= stats.range,
      );
      targets.sort(
        (a, b) =>
          routeLength(this.route(a)) -
          a.distance -
          (routeLength(this.route(b)) - b.distance),
      );
      const target = targets[0];
      if (!target) continue;
      tower.cooldown = stats.rate;
      if (tower.type === 'bramble') {
        for (const e of targets) {
          this.hit(e, stats.damage);
          e.slow = Math.max(
            e.slow,
            (tower.branch === 'power' ? 3.5 : 2.4) *
              (s.captain === 'fern' ? 1.6 : 1),
          );
        }
      } else if (tower.type === 'log') {
        for (const e of s.enemies)
          if (
            e.hp > 0 &&
            !e.flying &&
            Math.hypot(e.x - target.x, e.y - target.y) < 52
          )
            this.hit(e, stats.damage);
      } else this.hit(target, stats.damage, tower.type === 'watch');
      s.effects.push({
        kind: 'shot',
        x,
        y,
        tx: target.x,
        ty: target.y,
        life: 0.2,
        max: 0.2,
        colour: TOWERS[tower.type].colour,
        type: tower.type,
      });
    }
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    s.effects = s.effects.filter((e) => (e.life -= dt) > 0).slice(-100);
    if (!s.enemies.length && !s.queue.length) this.completeWave();
  }
  completeWave() {
    const s = this.state;
    if (s.phase !== 'battle') return;
    const mills = s.towers
      .filter((t) => t.type === 'mill')
      .reduce(
        (sum, t) =>
          sum +
          (16 + this.perk('millwright') * 10) *
            t.level *
            (t.branch === 'power' ? 1.5 : 1),
        0,
      );
    const income =
      35 + s.wave * 3 + Math.round(mills) + (s.waveLeaks === 0 ? 20 : 0);
    s.wood += income;
    s.totalWood += income;
    s.score = Math.min(
      100000000,
      s.score +
        150 +
        (s.waveLeaks === 0 ? 100 : 0) +
        Math.max(0, Math.round(180 - s.waveTime * 3)) +
        Math.floor(s.water / 4),
    );
    s.message = `Wave ${s.wave} held! +${income} wood${s.waveLeaks === 0 ? ' · perfect defence bonus' : ''}.`;
    if (s.wave === CAMPAIGN_WAVES && !s.endless) {
      s.victoryScore = s.score;
      this.finish(true);
      return;
    }
    if (s.wave % 3 === 0) {
      const pool = PERKS.filter((p) => this.perk(p.id) < p.max);
      pool.sort(
        (a, b) =>
          hash(`${s.seed}:${s.wave}:${a.id}`) -
          hash(`${s.seed}:${s.wave}:${b.id}`),
      );
      s.choices = pool.slice(0, 3).map((p) => p.id);
      s.phase = 'draft';
    } else s.phase = 'build';
    this.emit('wave-clear');
    this.emit('change');
    this.emit('save');
  }
  choose(id) {
    const s = this.state;
    if (!s || s.phase !== 'draft' || s.paused || !s.choices.includes(id))
      return false;
    s.perks[id] = this.perk(id) + 1;
    if (id === 'deep') {
      s.maxWater += 25;
      s.water = Math.min(s.maxWater, s.water + 25);
    }
    if (id === 'grove') {
      s.maxHp += 20;
      s.hp = Math.min(s.maxHp, s.hp + 20);
    }
    if (id === 'gift') {
      s.wood += 100;
      s.totalWood += 100;
    }
    s.message = `${PERKS.find((p) => p.id === id).name} chosen. Prepare your next defence.`;
    s.choices = [];
    s.phase = 'build';
    this.emit('change');
    this.emit('save');
    return true;
  }
  finish(won) {
    const s = this.state;
    if (!s || ['victory', 'over'].includes(s.phase)) return;
    s.phase = won ? 'victory' : 'over';
    s.paused = false;
    s.message = won
      ? `${MAPS[s.map].name} is safe. Your little village made it.`
      : 'The dam gave way. Every good defence starts with another idea.';
    this.emit('gameover', {
      score: s.score,
      wave: s.wave,
      won,
      map: s.map,
      daily: s.daily,
      id: s.id,
      endless: s.endless,
    });
    this.emit('change');
    this.emit('save');
  }
  continueEndless() {
    const s = this.state;
    if (!s || s.phase !== 'victory') return false;
    s.phase = 'build';
    s.endless = true;
    s.id += '-endless';
    s.message =
      'Endless river. Enemies grow stronger each wave. How long can you hold?';
    this.emit('change');
    this.emit('save');
    return true;
  }
  pause(on = !this.state?.paused) {
    if (!this.state || !['build', 'battle', 'draft'].includes(this.state.phase))
      return false;
    this.state.paused = !!on;
    this.emit('change');
    this.emit('save');
    return true;
  }
  snapshot() {
    return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
  }
  restore(input) {
    if (!validSave(input)) return false;
    this.state = JSON.parse(JSON.stringify(input));
    this.emit('change');
    return true;
  }
}

const object = (x) => x && typeof x === 'object' && !Array.isArray(x);
const number = (x) =>
  typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e12;
const count = (x) => number(x) && x >= 0 && Number.isInteger(x);
export function validSave(s) {
  try {
    if (
      !object(s) ||
      s.v !== 1 ||
      !count(s.seed) ||
      s.seed > 4294967295 ||
      !count(s.map) ||
      !MAPS[s.map] ||
      !CAPTAINS.some((c) => c.id === s.captain)
    )
      return false;
    if (
      !['build', 'battle', 'draft', 'victory', 'over'].includes(s.phase) ||
      typeof s.paused !== 'boolean' ||
      typeof s.endless !== 'boolean'
    )
      return false;
    if (!count(s.wave) || s.wave > 10000 || !/^[a-z0-9-]{8,64}$/.test(s.id))
      return false;
    for (const k of [
      'wood',
      'hp',
      'maxHp',
      'water',
      'maxWater',
      'score',
      'kills',
      'floods',
      'totalWood',
      'waveLeaks',
      'elapsed',
      'waveTime',
      'floodTimer',
      'floodCooldown',
      'spawnIn',
      'seq',
    ])
      if (!number(s[k]) || (k !== 'spawnIn' && s[k] < 0)) return false;
    if (
      s.hp > s.maxHp ||
      s.water > s.maxWater ||
      s.maxHp <= 0 ||
      s.maxWater <= 0
    )
      return false;
    if (s.daily) {
      if (!validDay(s.daily)) return false;
      const c = dailyConfig(s.daily);
      if (c.seed !== s.seed || c.map !== s.map || c.captain !== s.captain)
        return false;
    }
    if (
      !object(s.perks) ||
      !Object.entries(s.perks).every(([id, n]) =>
        PERKS.some((p) => p.id === id && count(n) && n <= p.max),
      )
    )
      return false;
    if (
      !Array.isArray(s.choices) ||
      s.choices.length > 3 ||
      !s.choices.every((id) => PERKS.some((p) => p.id === id))
    )
      return false;
    if (s.phase === 'draft' && !s.choices.length) return false;
    if (
      !Array.isArray(s.towers) ||
      s.towers.length > MAPS[s.map].pads.length ||
      new Set(s.towers.map((t) => t.pad)).size !== s.towers.length
    )
      return false;
    if (
      !s.towers.every(
        (t) =>
          object(t) &&
          Object.hasOwn(TOWERS, t.type) &&
          count(t.pad) &&
          MAPS[s.map].pads[t.pad] &&
          [1, 2, 3].includes(t.level) &&
          [null, 'power', 'reach'].includes(t.branch) &&
          count(t.spent) &&
          number(t.cooldown),
      )
    )
      return false;
    const spec = (e) =>
      object(e) &&
      Object.hasOwn(ENEMIES, e.type) &&
      count(e.lane) &&
      MAPS[s.map].paths[e.lane] &&
      typeof e.boss === 'boolean';
    if (
      !Array.isArray(s.queue) ||
      s.queue.length > 100 ||
      !s.queue.every(spec) ||
      !Array.isArray(s.enemies) ||
      s.enemies.length > 150
    )
      return false;
    if (
      !s.enemies.every(
        (e) =>
          spec(e) &&
          [
            'id',
            'hp',
            'maxHp',
            'distance',
            'age',
            'slow',
            'speed',
            'damage',
            'reward',
            'armour',
            'x',
            'y',
          ].every((k) => number(e[k])) &&
          e.distance >= 0,
      )
    )
      return false;
    if (
      !Array.isArray(s.effects) ||
      s.effects.length > 150 ||
      !s.effects.every(
        (e) =>
          object(e) &&
          ['x', 'y', 'life', 'max'].every((k) => number(e[k])) &&
          ['shot', 'pop', 'hurt'].includes(e.kind),
      )
    )
      return false;
    if (
      s.effects.some(
        (e) => e.kind === 'shot' && (!number(e.tx) || !number(e.ty)),
      )
    )
      return false;
    return typeof s.message === 'string';
  } catch {
    return false;
  }
}
