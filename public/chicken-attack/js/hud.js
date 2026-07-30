/* In-canvas HUD: score, wave, lives, weapon power, missiles and banners. */

import { clamp, formatScore, roundRect, easeOutBack, TAU } from './util.js';
import { MAX_LEVEL } from './weapons.js';
import { POWERUPS, BUFF_ORDER } from './powerups.js';
import { highScore } from './storage.js';

const FONT = '"Baloo 2", system-ui, -apple-system, sans-serif';

function text(ctx, str, x, y, size, color, align = 'left', weight = 800, outline = 3) {
  ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (outline) {
    ctx.lineWidth = outline;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(4,6,16,0.85)';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function drawHud(ctx, game) {
  const u = game.unit;
  const { w, h } = game;
  const p = game.player;
  const top = game.insetTop + 6 * u;

  ctx.save();

  /* ---- score / hi-score (top left) ------------------------------------- */
  text(ctx, formatScore(game.score || 0), 12 * u, top + 17 * u, 19 * u, '#ffffff', 'left', 900, 3.5 * u);
  const hi = Math.max(highScore(), game.score || 0);
  text(ctx, `HI ${formatScore(hi)}`, 12 * u, top + 30 * u, 10.5 * u, 'rgba(190,205,235,0.9)', 'left', 700, 3 * u);

  if (game.scoreMult > 1) {
    const pulse = 1 + Math.sin(game.time * 10) * 0.06;
    text(
      ctx,
      `x${game.scoreMult.toFixed(1)}`,
      12 * u,
      top + 45 * u,
      13 * u * pulse,
      '#ffd166',
      'left',
      900,
      3 * u
    );
  }

  /* ---- wave (top centre) ----------------------------------------------- */
  text(ctx, `WAVE ${game.waveNum || 1}`, w * 0.5, top + 16 * u, 12.5 * u, 'rgba(220,235,255,0.95)', 'center', 800, 3 * u);

  /* ---- bottom left: lives, weapon, food -------------------------------- */
  if (p) {
    const baseY = h - game.insetBottom - 6 * u;

    // Lives as little ships.
    const shown = Math.min(p.lives, 5);
    for (let i = 0; i < shown; i++) {
      game.art.draw(ctx, 'ship', 15 * u + i * 18 * u, baseY - 9 * u, 0, 0.5, 0.95);
    }
    if (p.lives > 5) {
      text(ctx, `x${p.lives}`, 15 * u + 5 * 18 * u, baseY - 4 * u, 11 * u, '#ffffff', 'left', 800, 3 * u);
    }

    // Weapon name + power segments.
    const wy = baseY - 26 * u;
    text(ctx, p.weapon.short, 13 * u, wy, 11 * u, p.weapon.color, 'left', 900, 3 * u);
    const segX = 13 * u + 34 * u;
    const segW = Math.min(9 * u, (w * 0.42 - 40 * u) / (MAX_LEVEL + 1));
    for (let i = 0; i <= MAX_LEVEL; i++) {
      const on = i <= p.level;
      ctx.fillStyle = on ? p.weapon.color : 'rgba(255,255,255,0.16)';
      ctx.globalAlpha = on ? 1 : 0.8;
      roundRect(ctx, segX + i * segW, wy - 8 * u, segW * 0.7, 8 * u, 1.5 * u);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Food counter (drumsticks toward the next extra life).
    const fy = baseY - 42 * u;
    game.art.draw(ctx, 'drumstick', 18 * u, fy - 4 * u, -0.2, 0.55);
    text(ctx, `${p.food}/100`, 30 * u, fy, 10.5 * u, 'rgba(255,220,170,0.95)', 'left', 700, 3 * u);

    // Missile stock lives on the on-screen button (see the DOM HUD).
  }

  drawBuffs(ctx, game);

  ctx.restore();
}

/**
 * Active power-ups, as a column of chips down the right edge (below the pause
 * button, above the missile button). Each chip is a countdown ring plus a short
 * label, and blinks in its last three seconds.
 */
function drawBuffs(ctx, game) {
  const p = game.player;
  if (!p) return;
  const u = game.unit;
  const size = 30 * u;
  const x = game.w - size * 0.5 - 10 * u;
  let y = game.insetTop + 58 * u;

  const chips = [];
  for (const id of BUFF_ORDER) {
    const left = p.buffLeft(id);
    if (left > 0) {
      chips.push({
        left,
        total: POWERUPS[id].duration,
        color: POWERUPS[id].color,
        icon: `icon_${id}`,
      });
    }
  }
  if (p.shield > 0) chips.push({ left: p.shield, total: 12, color: '#66d9e8', icon: 'icon_shield' });

  for (const chip of chips) {
    const frac = clamp(chip.left / chip.total, 0, 1);
    const ending = chip.left <= 3;
    const alpha = ending ? 0.45 + 0.55 * Math.abs(Math.sin(game.time * 12)) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(6,10,22,0.62)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, TAU);
    ctx.fill();

    // Countdown ring
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = chip.color;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
    ctx.stroke();

    // Glyph rather than text: it always fits the circle.
    game.art.draw(ctx, chip.icon, 0, 0, 0, 1);

    // Seconds left, small, under the glyph.
    if (chip.left <= 9.5) {
      ctx.font = `900 ${Math.round(9 * u)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = 'rgba(4,6,16,0.9)';
      ctx.strokeText(String(Math.ceil(chip.left)), 0, size * 0.62);
      ctx.fillStyle = chip.color;
      ctx.fillText(String(Math.ceil(chip.left)), 0, size * 0.62);
    }
    ctx.restore();

    y += size + 6 * u;
  }
}

export function drawBossBar(ctx, game, boss) {
  const u = game.unit;
  const w = game.w;
  const barW = Math.min(w * 0.66, 300 * u);
  const barH = 9 * u;
  const x = (w - barW) / 2;
  const y = game.insetTop + 48 * u;

  ctx.save();
  text(ctx, boss.name, w * 0.5, y - 5 * u, 11 * u, '#ffd7d7', 'center', 900, 3 * u);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x - 2 * u, y - 2 * u, barW + 4 * u, barH + 4 * u, 4 * u);
  ctx.fill();

  const frac = boss.hpFrac;
  const grad = ctx.createLinearGradient(x, y, x + barW, y);
  if (frac > 0.6) {
    grad.addColorStop(0, '#69db7c');
    grad.addColorStop(1, '#a9e34b');
  } else if (frac > 0.3) {
    grad.addColorStop(0, '#ffd43b');
    grad.addColorStop(1, '#ffa94d');
  } else {
    grad.addColorStop(0, '#ff8787');
    grad.addColorStop(1, '#ff6b6b');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, Math.max(2 * u, barW * frac), barH, 3 * u);
  ctx.fill();

  // Phase ticks at 1/3 and 2/3.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5 * u;
  for (const t of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(x + barW * t, y);
    ctx.lineTo(x + barW * t, y + barH);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBanner(ctx, game, banner) {
  banner.t += 1 / 60;
  const u = game.unit;
  const { w, h } = game;
  const t = clamp(banner.t / 0.45, 0, 1);
  const scale = 0.7 + easeOutBack(t) * 0.3;
  const y = h * 0.42;

  ctx.save();
  ctx.translate(w * 0.5, y);
  ctx.scale(scale, scale);

  // Soft backdrop so text stays legible over the action.
  const gw = Math.min(w * 0.92, 420 * u);
  const grad = ctx.createLinearGradient(-gw / 2, 0, gw / 2, 0);
  grad.addColorStop(0, 'rgba(6,8,20,0)');
  grad.addColorStop(0.5, 'rgba(6,8,20,0.72)');
  grad.addColorStop(1, 'rgba(6,8,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-gw / 2, -34 * u, gw, 68 * u);

  const pulse = banner.title === 'WARNING' ? 0.75 + 0.25 * Math.abs(Math.sin(banner.t * 8)) : 1;
  ctx.globalAlpha = pulse;
  text(ctx, banner.title, 0, 0, 30 * u, banner.color, 'center', 900, 5 * u);
  ctx.globalAlpha = 1;
  text(ctx, banner.sub, 0, 20 * u, 13 * u, 'rgba(230,240,255,0.95)', 'center', 700, 3.5 * u);
  ctx.restore();
}
