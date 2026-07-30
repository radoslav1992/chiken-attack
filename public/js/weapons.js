/*
 * The nine weapons. Each entry describes cadence, damage and the firing
 * pattern; the game only calls `fire(game, p, level)`.
 *
 * Weapon power runs 0..9. Collecting a gift of the equipped weapon adds a
 * level, a different weapon swaps to it (keeping the level, minus one, so
 * hoarding a single gun still pays off).
 */

import { TAU, rand, clamp, angleTo } from './util.js';

export const MAX_LEVEL = 9;

/** Number of barrels for a spread pattern at a given power level. */
function spreadCount(level) {
  return [1, 2, 3, 3, 4, 5, 5, 6, 7, 8][clamp(level, 0, 9)];
}

function fanAngles(level, step) {
  const n = spreadCount(level);
  const out = [];
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * step);
  return out;
}

export const WEAPONS = [
  {
    id: 'ion',
    name: 'Ion Blaster',
    short: 'ION',
    color: '#7ee8ff',
    desc: 'Reliable all-rounder. Widens into a fan as it powers up.',
    cooldown: (l) => 0.19 - l * 0.008,
    fire(game, p, l) {
      const dmg = 4 + l * 1.6;
      const speed = 720 + l * 14;
      const angles = fanAngles(l, 0.1);
      angles.forEach((a, i) => {
        game.spawnBullet({
          x: p.x + Math.sin(a) * 10 * game.unit,
          y: p.y - p.r * 0.7,
          angle: -Math.PI / 2 + a,
          speed,
          dmg,
          r: 4.2,
          kind: 'ion',
          color: '#8ef1ff',
        });
      });
      return 'ion';
    },
  },

  {
    id: 'neutron',
    name: 'Neutron Gun',
    short: 'NEU',
    color: '#ffd166',
    desc: 'Heavy slugs. Fewer shots, far more punch per hit.',
    cooldown: (l) => 0.32 - l * 0.012,
    fire(game, p, l) {
      const dmg = 13 + l * 4.6;
      const cols = l < 2 ? 1 : l < 5 ? 2 : l < 8 ? 3 : 4;
      for (let i = 0; i < cols; i++) {
        const off = (i - (cols - 1) / 2) * 15 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.6,
          angle: -Math.PI / 2,
          speed: 560,
          dmg,
          r: 7 + l * 0.3,
          kind: 'neutron',
          color: '#ffd166',
        });
      }
      return 'neutron';
    },
  },

  {
    id: 'railgun',
    name: 'Boron Railgun',
    short: 'RAIL',
    color: '#c792ff',
    desc: 'Hyper-velocity bolts that punch through a whole column.',
    cooldown: (l) => 0.34 - l * 0.014,
    fire(game, p, l) {
      const dmg = 11 + l * 3.4;
      const rails = l < 3 ? 1 : l < 6 ? 2 : 3;
      for (let i = 0; i < rails; i++) {
        const off = (i - (rails - 1) / 2) * 20 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.8,
          angle: -Math.PI / 2,
          speed: 1500,
          dmg,
          r: 5,
          kind: 'rail',
          color: '#d7b3ff',
          pierce: 2 + Math.floor(l / 2),
          len: 30 + l * 2,
        });
      }
      return 'railgun';
    },
  },

  {
    id: 'vulcan',
    name: 'Vulcan Chaingun',
    short: 'VULC',
    color: '#ff9f43',
    desc: 'Spits a torrent of tracer rounds with a lazy wobble.',
    cooldown: (l) => 0.075 - l * 0.003,
    fire(game, p, l) {
      const dmg = 2.6 + l * 0.85;
      const barrels = l < 4 ? 1 : l < 7 ? 2 : 3;
      for (let i = 0; i < barrels; i++) {
        const off = (i - (barrels - 1) / 2) * 13 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.6,
          angle: -Math.PI / 2 + rand(0.09, -0.09),
          speed: rand(940, 820),
          dmg,
          r: 3.4,
          kind: 'vulcan',
          color: '#ffc078',
        });
      }
      return 'vulcan';
    },
  },

  {
    id: 'positron',
    name: 'Positron Stream',
    short: 'POS',
    color: '#63e6be',
    desc: 'An unbroken beam of charged particles. Melts anything close.',
    cooldown: () => 0.03,
    fire(game, p, l) {
      const dmg = 1.5 + l * 0.5;
      const streams = l < 3 ? 1 : l < 6 ? 2 : l < 9 ? 3 : 4;
      for (let i = 0; i < streams; i++) {
        const off = (i - (streams - 1) / 2) * 11 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.75,
          angle: -Math.PI / 2,
          speed: 1250,
          dmg,
          r: 4 + l * 0.2,
          kind: 'positron',
          color: '#96f2d7',
          len: 22,
        });
      }
      return 'positron';
    },
  },

  {
    id: 'poker',
    name: 'Utensil Poker',
    short: 'FORK',
    color: '#dee2e6',
    desc: 'Flings cutlery in a wide arc. Surprisingly effective.',
    cooldown: (l) => 0.26 - l * 0.01,
    fire(game, p, l) {
      const dmg = 7 + l * 2.2;
      const angles = fanAngles(l, 0.26);
      angles.forEach((a) => {
        game.spawnBullet({
          x: p.x,
          y: p.y - p.r * 0.5,
          angle: -Math.PI / 2 + a,
          speed: 640,
          dmg,
          r: 8,
          kind: 'fork',
          color: '#e9ecef',
          spin: rand(16, 9),
          pierce: 1,
        });
      });
      return 'poker';
    },
  },

  {
    id: 'lightning',
    name: 'Lightning Fryer',
    short: 'ZAP',
    color: '#a5d8ff',
    desc: 'Arcs of electricity that leap from chicken to chicken.',
    cooldown: (l) => 0.3 - l * 0.012,
    fire(game, p, l) {
      const dmg = 6 + l * 2.1;
      const bolts = l < 5 ? 1 : 2;
      for (let i = 0; i < bolts; i++) {
        const off = (i - (bolts - 1) / 2) * 18 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.7,
          angle: -Math.PI / 2,
          speed: 900,
          dmg,
          r: 6,
          kind: 'zap',
          color: '#a5d8ff',
          chain: 2 + Math.floor(l / 2),
        });
      }
      return 'lightning';
    },
  },

  {
    id: 'plasma',
    name: 'Plasma Rifle',
    short: 'PLAS',
    color: '#ff6b6b',
    desc: 'Lobs slow plasma orbs that detonate in a scalding bloom.',
    cooldown: (l) => 0.5 - l * 0.02,
    fire(game, p, l) {
      const dmg = 15 + l * 5;
      const orbs = l < 4 ? 1 : l < 8 ? 2 : 3;
      for (let i = 0; i < orbs; i++) {
        const off = (i - (orbs - 1) / 2) * 30 * game.unit;
        game.spawnBullet({
          x: p.x + off,
          y: p.y - p.r * 0.6,
          angle: -Math.PI / 2,
          speed: 420,
          dmg,
          r: 9 + l * 0.4,
          kind: 'plasma',
          color: '#ff8787',
          splash: 52 + l * 5,
          spin: 3,
        });
      }
      return 'plasma';
    },
  },

  {
    id: 'corn',
    name: 'Corn Shotgun',
    short: 'CORN',
    color: '#ffe066',
    desc: 'Buckshot of scalding popcorn. Devastating up close.',
    cooldown: (l) => 0.42 - l * 0.016,
    fire(game, p, l) {
      const dmg = 4.4 + l * 1.3;
      const pellets = 5 + l * 2;
      for (let i = 0; i < pellets; i++) {
        const a = -Math.PI / 2 + rand(0.42, -0.42);
        game.spawnBullet({
          x: p.x + rand(6, -6) * game.unit,
          y: p.y - p.r * 0.5,
          angle: a,
          speed: rand(880, 620),
          dmg,
          r: 5,
          kind: 'corn',
          color: '#fff3bf',
          maxLife: rand(0.62, 0.42),
          spin: rand(9, -9),
        });
      }
      return 'corn';
    },
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

/* ------------------------------------------------------------ bullet paint -- */

/** Draw a player bullet. `t` is the elapsed game time, for animated glows. */
export function drawBullet(ctx, b, t) {
  const u = b.unit || 1;
  const r = b.r;
  switch (b.kind) {
    case 'rail':
    case 'positron': {
      const len = (b.len || 24) * u;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle + Math.PI / 2);
      const g = ctx.createLinearGradient(0, -len, 0, len * 0.4);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.4, b.color);
      g.addColorStop(1, 'rgba(255,255,255,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(-r * 0.5, -len, r, len * 1.2);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = b.color;
      ctx.fillRect(-r, -len * 0.8, r * 2, len);
      ctx.restore();
      break;
    }
    case 'fork': {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(1.4, r * 0.28);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(0, -r * 0.2);
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.42, -r * 0.2);
        ctx.lineTo(i * r * 0.5, -r);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'zap': {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(1.5, r * 0.4);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = r * 2;
      ctx.beginPath();
      let y = -r * 1.6;
      ctx.moveTo(0, y);
      for (let i = 0; i < 4; i++) {
        y += (r * 3.2) / 4;
        ctx.lineTo(rand(r * 0.9, -r * 0.9), y);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'plasma': {
      const pulse = 1 + Math.sin(t * 22 + b.seed) * 0.12;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.6 * pulse);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, b.color);
      g.addColorStop(0.75, 'rgba(255,80,80,0.55)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 1.6 * pulse, 0, TAU);
      ctx.fill();
      break;
    }
    case 'corn': {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.color;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffec99';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'neutron': {
      const g = ctx.createRadialGradient(b.x, b.y - r * 0.3, 0, b.x, b.y, r * 1.3);
      g.addColorStop(0, '#fff9db');
      g.addColorStop(0.5, b.color);
      g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, r * 1.1, r * 1.4, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'vulcan':
    default: {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle + Math.PI / 2);
      // Soft halo so bolts read clearly against the starfield.
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
      halo.addColorStop(0, b.color);
      halo.addColorStop(0.45, 'rgba(120,220,255,0.35)');
      halo.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, r * 3, 0, TAU);
      ctx.fill();

      const g = ctx.createLinearGradient(0, -r * 3.4, 0, r * 1.6);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, b.color);
      g.addColorStop(0.7, '#ffffff');
      g.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.9, r * 1.05, r * 2.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -r * 0.7, r * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Draw a player missile plus its exhaust plume. */
export function drawMissile(ctx, m, art) {
  art.draw(ctx, 'missile', m.x, m.y, m.angle + Math.PI / 2, m.scale || 1);
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.angle + Math.PI / 2);
  const flame = m.r * rand(3.2, 1.9);
  const g = ctx.createLinearGradient(0, m.r * 0.6, 0, m.r * 0.6 + flame);
  g.addColorStop(0, 'rgba(255,240,180,0.95)');
  g.addColorStop(0.4, 'rgba(255,140,60,0.7)');
  g.addColorStop(1, 'rgba(255,60,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-m.r * 0.45, m.r * 0.6);
  ctx.lineTo(m.r * 0.45, m.r * 0.6);
  ctx.lineTo(0, m.r * 0.6 + flame);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Enemy projectiles: eggs, feathers and boss orbs. */
export function drawEnemyShot(ctx, e, art, t) {
  switch (e.kind) {
    case 'orb': {
      const pulse = 1 + Math.sin(t * 16 + e.seed) * 0.15;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 1.8 * pulse);
      g.addColorStop(0, '#fff5cc');
      g.addColorStop(0.4, '#ffb703');
      g.addColorStop(0.8, 'rgba(255,120,0,0.5)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 1.8 * pulse, 0, TAU);
      ctx.fill();
      break;
    }
    case 'feather':
      art.draw(ctx, 'feather', e.x, e.y, e.rot, e.scale, 0.9, 0);
      break;
    case 'bigEgg':
      art.draw(ctx, 'eggBig', e.x, e.y, e.rot, e.scale);
      break;
    default:
      art.draw(ctx, 'egg', e.x, e.y, e.rot, e.scale);
  }
}

/** Homing target search shared by missiles and lightning chains. */
export function nearestEnemy(game, x, y, maxDist = Infinity, exclude = null) {
  let best = null;
  let bestD = maxDist * maxDist;
  game.enemies.forEach((e) => {
    if (e.dead || e === exclude || e.entering) return;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  });
  return best;
}

export function aimAt(x, y, target) {
  return angleTo(x, y, target.x, target.y);
}
