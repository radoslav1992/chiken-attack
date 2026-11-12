/*
 * Timber Tails — drawing. Reads a Game and paints it; never changes it.
 *
 * The canvas is kept at a whole multiple of the 240-line picture and scaled
 * down by CSS, so pixels stay square on any screen without shimmering.
 */

import {
  T,
  GROUND,
  STONE,
  CRATE,
  STASH,
  USED,
  BRANCH,
  THORN,
  SHROOM,
  ICE,
  WATER,
  CRUMBLE,
  ACORN,
  LOG,
  BERRY,
  CHECK,
  GOAL,
} from './engine.js';
import { pip, creature, item, tileset, drawText, THEMES } from './sprites.js';

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.vw = 384;
    this.vh = 240;
    this.k = 2;
    this.bumps = [];
    this.squash = new Map();
  }

  resize(vw, k) {
    this.vw = vw;
    this.k = k;
    this.canvas.width = vw * k;
    this.canvas.height = this.vh * k;
  }

  /** A struck block hops; a mushroom squashes. Both are drawing-only. */
  bump(c, r) {
    this.bumps.push({ c, r, t: 0 });
  }
  boing(c, r) {
    this.squash.set(`${c},${r}`, 12);
  }

  draw(game, view) {
    const g = this.g,
      k = this.k,
      { vw, vh } = this;
    const th = THEMES[game.level.theme];
    const tiles = tileset(game.level.theme);
    const t = view.t;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = false;
    const cam = Math.round(view.camX * k) / k;
    const sy = view.shake ? Math.round((hash(t) - 0.5) * view.shake) : 0;

    this.sky(g, th, cam, t);

    g.save();
    g.translate(-cam, sy);
    const c0 = Math.max(0, Math.floor(cam / T) - 1),
      c1 = Math.min(game.w - 1, Math.floor((cam + vw) / T) + 1);

    /* door and checkpoints sit behind everything else */
    for (let r = 0; r < game.h; r++)
      for (let c = c0 - 2; c <= c1 + 2; c++) {
        const id = game.tile(c, r);
        if (id === GOAL && c >= 0 && c < game.w) g.drawImage(tiles.door[game.bossDead ? 1 : 0], c * T - 16, (r + 1) * T - 40);
        else if (id === CHECK && c >= 0 && c < game.w) {
          const on = game.checkpoint && game.checkpoint.x === c;
          g.drawImage(tiles.check[on ? 1 : 0], c * T, (r + 1) * T - 32);
        }
      }

    for (const b of this.bumps) b.t++;
    this.bumps = this.bumps.filter((b) => b.t < 10);
    for (const [key, v] of this.squash) v <= 1 ? this.squash.delete(key) : this.squash.set(key, v - 1);

    for (let r = 0; r < game.h; r++)
      for (let c = c0; c <= c1; c++) {
        const id = game.tiles[r * game.w + c];
        if (!id || id === WATER || id === GOAL || id === CHECK) continue;
        const x = c * T;
        let y = r * T;
        const bump = this.bumps.find((b) => b.c === c && b.r === r);
        if (bump) y -= Math.round(Math.sin((bump.t / 10) * Math.PI) * 5);
        switch (id) {
          case GROUND: {
            const above = game.tile(c, r - 1);
            const top = r > 0 && above !== GROUND && above !== STONE && above !== ICE;
            g.drawImage((top ? tiles.groundTop : tiles.ground)[(c * 7 + r * 3) % 2], x, y);
            break;
          }
          case STONE:
            g.drawImage(tiles.stone, x, y);
            break;
          case CRATE:
            g.drawImage(tiles.crate, x, y);
            break;
          case STASH:
            g.drawImage(tiles.stash[Math.floor(t / 14 + c) % 4 === 0 ? 2 : Math.floor(t / 28) % 2], x, y);
            break;
          case USED:
            g.drawImage(tiles.used, x, y);
            break;
          case BRANCH:
            g.drawImage(tiles.branch, x, y);
            break;
          case THORN:
            g.drawImage(tiles.thorn, x, y);
            break;
          case SHROOM: {
            const s = this.squash.get(`${c},${r}`) || 0;
            const h = 16 - Math.round(Math.sin((s / 12) * Math.PI) * 6);
            g.drawImage(tiles.shroom, x - (16 - h) / 4, y + 16 - h, 16 + (16 - h) / 2, h);
            break;
          }
          case ICE:
            g.drawImage(tiles.ice, x, y);
            break;
          case CRUMBLE: {
            const shaking = game.crumble.has(r * game.w + c);
            g.drawImage(tiles.crumble, x + (shaking ? (t % 4 < 2 ? -1 : 1) : 0), y);
            break;
          }
          case ACORN: {
            const w = Math.abs(Math.cos(t * 0.07 + c));
            const spr = item('acorn');
            const ww = Math.max(2, Math.round(10 * w));
            g.drawImage(spr, x + 8 - ww / 2, y + 2 + Math.round(Math.sin(t * 0.08 + c) * 1.5), ww, 12);
            break;
          }
          case LOG:
            g.drawImage(item('log'), x + 1, y + 4 + Math.round(Math.sin(t * 0.06) * 2));
            if (t % 40 < 8) {
              g.fillStyle = '#ffffff';
              g.fillRect(x + ((t * 3) % 14), y + 2 + ((t * 5) % 10), 1, 1);
            }
            break;
          case BERRY:
            g.drawImage(item('berry'), x + 2, y + 4);
            break;
        }
      }

    /* rafts and lifts */
    for (const m of game.movers) {
      const x = Math.round(m.x),
        y = Math.round(m.y);
      g.fillStyle = '#553418';
      g.fillRect(x, y, m.w, 8);
      g.fillStyle = '#a8744a';
      g.fillRect(x + 1, y + 1, m.w - 2, 5);
      g.fillStyle = '#d9a66e';
      g.fillRect(x + 1, y + 1, m.w - 2, 1);
      g.fillStyle = '#553418';
      for (let i = 12; i < m.w; i += 12) g.fillRect(x + i, y + 1, 1, 6);
      if (m.axis === 'y') {
        g.fillStyle = '#3a2412';
        g.fillRect(x + 4, y - 300, 1, 300);
        g.fillRect(x + m.w - 5, y - 300, 1, 300);
      }
    }

    for (const e of game.ents) this.ent(g, game, e, t);
    this.player(g, game, t);

    /* liquid goes over the top of whatever fell in */
    for (let r = 0; r < game.h; r++)
      for (let c = c0; c <= c1; c++) {
        if (game.tiles[r * game.w + c] !== WATER) continue;
        const x = c * T,
          y = r * T;
        const surface = game.tile(c, r - 1) !== WATER;
        g.fillStyle = th.liquid[0];
        g.globalAlpha = 0.88;
        g.fillRect(x, y + (surface ? 5 : 0), T, T - (surface ? 5 : 0));
        g.globalAlpha = 1;
        if (surface) {
          g.fillStyle = th.liquid[1];
          for (let i = 0; i < 16; i += 2) {
            const wave = Math.round(Math.sin((x + i) * 0.2 + t * 0.08) * 1.5);
            g.fillRect(x + i, y + 4 + wave, 2, 2);
          }
        }
      }

    for (const p of view.particles) {
      g.fillStyle = p.col;
      g.globalAlpha = Math.min(1, p.life / 12);
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;
    for (const p of view.popups) drawText(g, p.text, p.x, p.y, p.col || '#ffffff');
    g.restore();

    if (th.dark) {
      const px = game.p.x + 5 - cam,
        py = game.p.y + 7;
      const grad = g.createRadialGradient(px, py, 30, px, py, 190);
      grad.addColorStop(0, 'rgba(10,6,20,0)');
      grad.addColorStop(1, 'rgba(10,6,20,0.62)');
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
    }
    if (th.fx === 'rain') {
      g.fillStyle = 'rgba(200,220,255,0.45)';
      for (let i = 0; i < 46; i++) {
        const x = (hash(i) * (vw + 80) + t * 2.2 * -1 + i * 31) % (vw + 80);
        const y = (hash(i + 99) * vh + t * 6.5) % vh;
        g.fillRect(((x % (vw + 80)) + vw + 80) % (vw + 80) - 40, y, 1, 6);
      }
      const cyc = t % 620;
      if (cyc < 5 || (cyc > 9 && cyc < 12)) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(0, 0, vw, vh);
      }
    }
    if (view.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.6, view.flash / 12)})`;
      g.fillRect(0, 0, vw, vh);
    }
  }

  /* ----------------------------------------------------------- backdrop -- */

  sky(g, th, cam, t) {
    const { vw, vh } = this;
    const grad = g.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, th.sky[0]);
    grad.addColorStop(0.55, th.sky[1]);
    grad.addColorStop(1, th.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);

    if (th.fx === 'stars') {
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        const x = (hash(i) * 900 - cam * 0.04) % vw;
        const tw = (t + i * 13) % 90 < 70;
        if (tw) g.fillRect((x + vw) % vw, hash(i + 50) * 130, 1, 1);
      }
      const mx = vw * 0.72 - cam * 0.02,
        my = 42;
      g.fillStyle = '#fff6c8';
      g.beginPath();
      g.arc(mx, my, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8dca0';
      g.fillRect(mx - 8, my - 6, 5, 4);
      g.fillRect(mx + 3, my + 4, 6, 4);
      g.fillRect(mx + 5, my - 9, 3, 3);
    }
    if (th.fx === 'clouds') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 7; i++) {
        const x = ((hash(i) * 700 - cam * 0.12 - t * 0.05) % (vw + 120) + vw + 120) % (vw + 120) - 60;
        const y = 18 + hash(i + 20) * 70;
        g.fillRect(x, y + 6, 46, 9);
        g.fillRect(x + 8, y, 22, 8);
        g.fillRect(x + 26, y + 3, 14, 6);
      }
    }
    if (th.fx === 'embers') {
      g.fillStyle = '#ffd23a';
      g.beginPath();
      g.arc(vw * 0.3 - cam * 0.02, 150, 46, 0, Math.PI * 2);
      g.globalAlpha = 0.25;
      g.fill();
      g.globalAlpha = 1;
    }

    /* far ridge */
    g.fillStyle = th.far;
    const o1 = cam * 0.18;
    for (let x = 0; x < vw; x += 2) {
      const wx = x + o1;
      const h = 62 + Math.sin(wx * 0.011) * 22 + Math.sin(wx * 0.031 + 2) * 9;
      g.fillRect(x, vh - h - 26, 2, h + 26);
    }
    /* nearer growth */
    const o2 = cam * 0.4;
    const gap = th.trees === 'reeds' ? 14 : th.trees === 'mill' ? 150 : 46;
    g.fillStyle = th.mid;
    g.fillRect(0, vh - 44, vw, 44);
    for (let i = Math.floor(o2 / gap) - 1; i < (o2 + vw) / gap + 1; i++) {
      const x = Math.round(i * gap - o2 + hash(i) * gap * 0.5);
      const s = 0.7 + hash(i + 7) * 0.6;
      const base = vh - 42;
      switch (th.trees) {
        case 'round': {
          const r = 15 * s;
          g.fillRect(x - 2, base - 24 * s, 4, 26 * s);
          g.beginPath();
          g.arc(x, base - 30 * s, r, 0, Math.PI * 2);
          g.arc(x - r * 0.7, base - 22 * s, r * 0.7, 0, Math.PI * 2);
          g.arc(x + r * 0.7, base - 22 * s, r * 0.7, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'pine': {
          const h = 70 * s;
          g.fillRect(x - 2, base - 8, 4, 10);
          for (let j = 0; j < 4; j++) {
            const w = (7 + j * 6) * s;
            const y = base - h + j * h * 0.24;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + w, y + h * 0.34);
            g.lineTo(x - w, y + h * 0.34);
            g.fill();
          }
          break;
        }
        case 'reeds': {
          const h = 26 + hash(i + 3) * 40;
          g.fillRect(x, base - h, 1, h + 4);
          if (hash(i + 5) > 0.5) g.fillRect(x - 1, base - h - 7, 3, 8);
          break;
        }
        case 'spikes': {
          const h = 30 + hash(i + 3) * 50;
          g.beginPath();
          g.moveTo(x - 12 * s, base + 4);
          g.lineTo(x, base - h);
          g.lineTo(x + 12 * s, base + 4);
          g.fill();
          g.beginPath();
          g.moveTo(x + 10, 0);
          g.lineTo(x + 20, 20 + hash(i + 9) * 46);
          g.lineTo(x + 30, 0);
          g.fill();
          break;
        }
        case 'dead': {
          const h = 50 * s;
          g.fillRect(x - 2, base - h, 4, h + 4);
          g.fillRect(x - 12 * s, base - h * 0.7, 12 * s, 2);
          g.fillRect(x - 12 * s, base - h * 0.7 - 8, 2, 8);
          g.fillRect(x, base - h * 0.5, 14 * s, 2);
          g.fillRect(x + 14 * s - 2, base - h * 0.5 - 10, 2, 10);
          break;
        }
        case 'mill': {
          g.fillRect(x - 12, base - 60, 24, 64);
          g.beginPath();
          g.moveTo(x - 16, base - 60);
          g.lineTo(x, base - 80);
          g.lineTo(x + 16, base - 60);
          g.fill();
          g.save();
          g.translate(x, base - 62);
          g.rotate(t * 0.01 + i);
          for (let b = 0; b < 4; b++) {
            g.rotate(Math.PI / 2);
            g.fillRect(-2, 0, 4, 40);
            g.fillRect(-7, 16, 14, 24);
          }
          g.restore();
          break;
        }
      }
    }

    /* drifting things */
    if (th.fx === 'snow' || th.fx === 'spores' || th.fx === 'embers' || th.fx === 'flies') {
      const up = th.fx === 'embers' || th.fx === 'spores';
      g.fillStyle = th.fx === 'snow' ? '#ffffff' : th.fx === 'embers' ? '#ffb040' : th.fx === 'flies' ? '#fff6a0' : '#8ff0d0';
      for (let i = 0; i < 40; i++) {
        const sp = 0.25 + hash(i + 3) * 0.6;
        const x = ((hash(i) * 600 - cam * 0.3 + Math.sin(t * 0.02 + i) * 12) % vw + vw) % vw;
        let y = (hash(i + 40) * vh + t * sp * (up ? -1 : 1)) % vh;
        if (y < 0) y += vh;
        if (th.fx === 'flies' && (t + i * 17) % 120 > 60) continue;
        g.fillRect(x, y, th.fx === 'snow' && i % 3 === 0 ? 2 : 1, th.fx === 'snow' && i % 3 === 0 ? 2 : 1);
      }
    }
  }

  /* ---------------------------------------------------------- creatures -- */

  ent(g, game, e, t) {
    if (e.type === 'mover') return;
    const x = Math.round(e.x),
      y = Math.round(e.y);
    const blit = (spr, dx, dy, flipX, flipY) => {
      if (!flipX && !flipY) return g.drawImage(spr, dx, dy);
      g.save();
      g.translate(dx + (flipX ? spr.width : 0), dy + (flipY ? spr.height : 0));
      g.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      g.drawImage(spr, 0, 0);
      g.restore();
    };
    const dead = e.dead > 0;
    if (dead && (e.type === 'cone' || e.type === 'item' || e.type === 'ripple' || e.type === 'icicle')) return;
    switch (e.type) {
      case 'snail':
      case 'beetle':
      case 'hog':
        blit(creature(e.type, Math.floor(t / 10)), x - 2, y - 6, e.face < 0, dead);
        break;
      case 'frog':
        blit(creature('frog', e.onGround ? 0 : 1), x - 2, y - 6, e.face < 0, dead);
        break;
      case 'wasp':
        blit(creature('wasp', Math.floor(t / 3)), x - 2, y - 4, e.face < 0, dead);
        break;
      case 'bat':
        if (e.state === 'hang' && !dead) blit(creature('bat', 1), x - 2, y - 8, false, true);
        else blit(creature('bat', Math.floor(t / 6)), x - 2, y - 8, false, dead);
        break;
      case 'pike':
        if (e.y < e.base) blit(creature('pike'), x - 3, y - 1, false, e.vy > 0.5 || dead);
        break;
      case 'icicle':
        blit(creature('icicle'), x - 4 + (e.state === 'shake' ? (t % 4 < 2 ? -1 : 1) : 0), y, false, false);
        break;
      case 'saw': {
        const spr = creature('saw');
        g.save();
        g.translate(x + 7, y + 7);
        g.rotate(Math.floor(t / 3) * (Math.PI / 8));
        g.drawImage(spr, -8, -8);
        g.restore();
        break;
      }
      case 'geyser': {
        const bx = x - 3,
          by = y + 48;
        g.fillStyle = '#2a1a1a';
        g.fillRect(bx + 2, by - 3, 12, 3);
        g.fillStyle = '#5a3a34';
        g.fillRect(bx + 3, by - 4, 10, 1);
        if (e.state === 'warn') {
          g.fillStyle = t % 6 < 3 ? '#ffd23a' : '#ff7a1a';
          for (let i = 0; i < 4; i++) g.fillRect(bx + 4 + ((t * 3 + i * 5) % 8), by - 6 - ((t * 2 + i * 7) % 12), 1, 2);
        } else if (e.state === 'erupt') {
          for (let i = 0; i < 46; i += 2) {
            const w = 8 - Math.floor(i / 9) + Math.round(Math.sin(t * 0.5 + i) * 1.5);
            g.fillStyle = i < 14 ? '#fff3a0' : i < 30 ? '#ffb030' : '#ff6a1a';
            g.fillRect(bx + 8 - w / 2, by - 4 - i, w, 2);
          }
        }
        break;
      }
      case 'ripple':
        g.fillStyle = '#fff3d6';
        g.fillRect(x, y + 4, 10, 4);
        g.fillStyle = '#d9a66e';
        g.fillRect(x + 2, y + (t % 6 < 3 ? 0 : 2), 6, 4);
        break;
      case 'cone': {
        const spr = item('cone');
        g.save();
        g.translate(x + 4, y + 4);
        g.rotate(Math.floor(t / 4) * (Math.PI / 2));
        g.drawImage(spr, -4, -4);
        g.restore();
        break;
      }
      case 'item': {
        const kind = { h: 'berry', c: 'cones', g: 'gold', l: 'clover' }[e.kind];
        g.drawImage(item(kind), x + (kind === 'gold' ? 1 : 0), y + (kind === 'berry' ? 2 : 0));
        break;
      }
      case 'boar': {
        if (e.state === 'idle') {
          blit(creature('boar', 0), x - 2, y - 4, true, false);
          g.fillStyle = '#ffffff';
          const z = Math.floor(t / 30) % 3;
          for (let i = 0; i <= z; i++) g.fillRect(x - 2 - i * 4, y - 8 - i * 5, 3, 1), g.fillRect(x - 1 - i * 4, y - 7 - i * 5, 1, 1), g.fillRect(x - 2 - i * 4, y - 6 - i * 5, 3, 1);
          break;
        }
        const flash = e.state === 'hit' || (e.state === 'dying' && t % 6 < 3);
        const run = e.state === 'charge' ? Math.floor(t / 5) : 0;
        blit(creature('boar', run, flash), x - 2, y - 4 + (e.state === 'stun' ? 1 : 0), e.face < 0, false);
        if (e.state === 'stun') {
          g.fillStyle = '#ffe27a';
          for (let i = 0; i < 3; i++) {
            const a = t * 0.15 + (i * Math.PI * 2) / 3;
            g.fillRect(x + 14 + Math.cos(a) * 12, y - 8 + Math.sin(a) * 3, 2, 2);
          }
        }
        break;
      }
    }
  }

  player(g, game, t) {
    const p = game.p;
    if (game.state === 'clear') return;
    if (p.inv > 0 && !p.dead && t % 6 < 3) return;
    let pose = 'idle';
    if (p.slam) pose = 'slam';
    else if (!p.onGround) pose = 'jump';
    else if (Math.abs(p.vx) > 0.25) pose = Math.floor(p.anim / 7) % 2 ? 'run1' : 'run2';
    let look = p.cones ? 'cones' : 'plain';
    if (p.gold > 0 && (p.gold > 90 || t % 8 < 4)) look = t % 8 < 4 ? 'gold' : look;
    const spr = pip(pose, look);
    const x = Math.round(p.x) - 3,
      y = Math.round(p.y) - 2;
    g.save();
    g.translate(x + (p.face < 0 ? 16 : 0), y + (p.dead ? 16 : 0));
    g.scale(p.face < 0 ? -1 : 1, p.dead ? -1 : 1);
    g.drawImage(spr, 0, 0);
    g.restore();
    if (p.gold > 0 && t % 4 === 0) {
      g.fillStyle = '#fff6c0';
      g.fillRect(x + ((t * 7) % 16), y + ((t * 3) % 16), 1, 1);
    }
  }
}
