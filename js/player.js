/* The player's ship: movement, weapon handling, shields and death. */

import { clamp, lerp, TAU } from './util.js';
import { WEAPONS, WEAPON_BY_ID, MAX_LEVEL } from './weapons.js';
import { sfx, vibrate } from './audio.js';
import { settings } from './storage.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.reset(true);
  }

  reset(full = false) {
    const g = this.game;
    this.x = g.w * 0.5;
    this.y = g.h * 0.82;
    this.vx = 0;
    this.vy = 0;
    this.r = 15 * g.unit;
    this.rot = 0;
    this.dead = false;
    this.cooldown = 0;
    this.missileCooldown = 0;
    this.invuln = 2.2;
    this.thrust = 0;
    this.hitFlash = 0;

    if (full) {
      this.lives = 3;
      this.weapon = WEAPONS[0];
      this.level = 0;
      this.missiles = 3;
      this.food = 0;
      this.shield = 0;
      this.overheat = 0;
    }
  }

  get spriteKey() {
    return this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0 ? 'shipGhost' : 'ship';
  }

  /* ------------------------------------------------------------ movement -- */

  update(dt, input) {
    const g = this.game;
    const u = g.unit;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.cooldown -= dt;
    this.missileCooldown -= dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    const speed = 560 * u;
    const follow = settings.get('controls') === 'follow';

    if (input.pointerActive) {
      if (follow) {
        // Absolute: the ship chases the finger (offset up so it stays visible).
        this.tx = input.pointerX;
        this.ty = input.pointerY - 34 * u;
      } else {
        // Relative drag: the ship keeps its offset from the finger.
        if (input.dragStarted) {
          this.tx = this.x;
          this.ty = this.y;
        }
        this.tx = (this.tx ?? this.x) + input.dragDX * 1.35;
        this.ty = (this.ty ?? this.y) + input.dragDY * 1.35;
      }
    } else if (input.hovering && !input.axisX && !input.axisY && g.pointerIsMouse) {
      this.tx = input.pointerX;
      this.ty = input.pointerY;
    }

    if (input.axisX || input.axisY) {
      // Keyboard / gamepad takes over and clears any touch target.
      this.tx = null;
      this.ty = null;
      this.vx = lerp(this.vx, input.axisX * speed, 1 - Math.pow(0.001, dt));
      this.vy = lerp(this.vy, input.axisY * speed, 1 - Math.pow(0.001, dt));
    } else if (this.tx != null) {
      const k = 1 - Math.pow(0.0000015, dt);
      this.vx = ((this.tx - this.x) * k) / dt;
      this.vy = ((this.ty - this.y) * k) / dt;
      const max = speed * 2.4;
      this.vx = clamp(this.vx, -max, max);
      this.vy = clamp(this.vy, -max, max);
    } else {
      this.vx = lerp(this.vx, 0, 1 - Math.pow(0.002, dt));
      this.vy = lerp(this.vy, 0, 1 - Math.pow(0.002, dt));
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const marginX = this.r * 0.9;
    const top = g.h * 0.32;
    const bottom = g.h - this.r - g.insetBottom;
    if (this.x < marginX) {
      this.x = marginX;
      this.vx = 0;
      if (this.tx != null) this.tx = marginX;
    }
    if (this.x > g.w - marginX) {
      this.x = g.w - marginX;
      this.vx = 0;
      if (this.tx != null) this.tx = g.w - marginX;
    }
    if (this.y < top) {
      this.y = top;
      this.vy = 0;
      if (this.ty != null) this.ty = top;
    }
    if (this.y > bottom) {
      this.y = bottom;
      this.vy = 0;
      if (this.ty != null) this.ty = bottom;
    }

    this.rot = lerp(this.rot, clamp(this.vx / (speed * 2.2), -0.35, 0.35), 1 - Math.pow(0.001, dt));
    this.thrust = lerp(this.thrust, 0.6 + Math.min(1, Math.abs(this.vy) / (speed * 1.2)) * 0.4, dt * 8);

    /* ---------------------------------------------------------- shooting -- */
    const auto = settings.get('autofire');
    const wantsFire = auto ? true : input.firing || input.keyboardFire;
    if (wantsFire && this.cooldown <= 0 && g.state === 'playing') {
      const kind = this.weapon.fire(g, this, this.level);
      this.cooldown = Math.max(0.028, this.weapon.cooldown(this.level));
      sfx.shoot(kind, this.level);
      g.shake(0.6 * (this.weapon.id === 'plasma' ? 2.4 : 1));
    }
  }

  /* -------------------------------------------------------------- combat -- */

  fireMissile() {
    const g = this.game;
    if (g.state !== 'playing' || this.missileCooldown > 0 || this.missiles <= 0) return false;
    this.missiles -= 1;
    this.missileCooldown = 0.45;
    g.spawnMissile(this.x, this.y - this.r);
    sfx.missile();
    vibrate(18);
    return true;
  }

  /** @returns true when the hit actually killed the ship. */
  takeHit() {
    if (this.invuln > 0 || this.dead) return false;
    if (this.shield > 0) {
      this.shield = 0;
      this.invuln = 1.1;
      this.hitFlash = 1;
      sfx.shield();
      vibrate(30);
      this.game.shake(6);
      return false;
    }
    this.dead = true;
    this.lives -= 1;
    // Losing a life costs weapon power, as in the original.
    this.level = Math.max(0, this.level - 2);
    sfx.playerHit();
    vibrate([40, 60, 90]);
    return true;
  }

  respawn() {
    const g = this.game;
    this.dead = false;
    this.x = g.w * 0.5;
    this.y = g.h * 0.9;
    this.tx = null;
    this.ty = null;
    this.vx = 0;
    this.vy = 0;
    this.invuln = 2.6;
    this.cooldown = 0.4;
  }

  /* ------------------------------------------------------------- pickups -- */

  addWeapon(weaponId) {
    if (this.weapon.id === weaponId) {
      if (this.level < MAX_LEVEL) {
        this.level += 1;
        sfx.powerup();
        this.game.flash(this.weapon.color);
        this.game.floatText(`${this.weapon.short} ${this.level + 1}`, this.x, this.y - 30 * this.game.unit, this.weapon.color);
      } else {
        this.game.addScore(2000);
        this.game.floatText('MAX +2000', this.x, this.y - 30 * this.game.unit, '#ffd166');
        sfx.powerup();
      }
    } else {
      this.weapon = WEAPON_BY_ID[weaponId];
      this.level = Math.max(0, this.level - 1);
      sfx.weaponSwap();
      this.game.flash(this.weapon.color);
      this.game.floatText(this.weapon.name.toUpperCase(), this.x, this.y - 30 * this.game.unit, this.weapon.color);
    }
    vibrate(22);
  }

  addPower() {
    if (this.level < MAX_LEVEL) {
      this.level += 1;
      this.game.floatText(`POWER ${this.level + 1}`, this.x, this.y - 30 * this.game.unit, '#69db7c');
    } else {
      this.game.addScore(1500);
      this.game.floatText('MAX +1500', this.x, this.y - 30 * this.game.unit, '#ffd166');
    }
    sfx.powerup();
    this.game.flash('#69db7c');
    vibrate(22);
  }

  addMissiles(n = 3) {
    this.missiles = Math.min(15, this.missiles + n);
    sfx.pickup();
    this.game.floatText(`+${n} MISSILES`, this.x, this.y - 30 * this.game.unit, '#91a7ff');
    vibrate(16);
  }

  addShield(seconds = 12) {
    this.shield = Math.max(this.shield, seconds);
    sfx.shield();
    this.game.floatText('SHIELD', this.x, this.y - 30 * this.game.unit, '#66d9e8');
    vibrate(16);
  }

  addLife() {
    this.lives += 1;
    sfx.extraLife();
    this.game.floatText('EXTRA LIFE', this.x, this.y - 30 * this.game.unit, '#ffa8c5');
    this.game.flash('#ffa8c5');
    vibrate([20, 40, 20]);
  }

  /** Drumsticks: 100 of them buy a life, just like the original. */
  addFood(n = 1) {
    this.food += n;
    while (this.food >= 100) {
      this.food -= 100;
      this.addLife();
    }
  }

  /* ---------------------------------------------------------------- paint -- */

  draw(ctx, art, t) {
    if (this.dead) return;
    const u = this.game.unit;
    const flicker = this.invuln > 0 ? 0.45 + 0.55 * Math.abs(Math.sin(t * 24)) : 1;

    // Engine flames
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const len = (16 + Math.sin(t * 40) * 4) * u * this.thrust;
    for (const sx of [-1, 1]) {
      const g = ctx.createLinearGradient(0, this.r * 0.7, 0, this.r * 0.7 + len);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(120,200,255,0.75)');
      g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx * this.r * 0.62 - this.r * 0.13, this.r * 0.62);
      ctx.lineTo(sx * this.r * 0.62 + this.r * 0.13, this.r * 0.62);
      ctx.lineTo(sx * this.r * 0.62, this.r * 0.62 + len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = flicker;
    art.draw(ctx, this.spriteKey, this.x, this.y, this.rot, 1);
    ctx.restore();

    // Shield bubble
    if (this.shield > 0) {
      const fade = this.shield < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 14)) : 1;
      ctx.save();
      ctx.globalAlpha = 0.55 * fade;
      const r = this.r * 2.05;
      const g = ctx.createRadialGradient(this.x, this.y, r * 0.55, this.x, this.y, r);
      g.addColorStop(0, 'rgba(102,217,232,0)');
      g.addColorStop(0.75, 'rgba(102,217,232,0.35)');
      g.addColorStop(1, 'rgba(180,250,255,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,250,255,0.8)';
      ctx.lineWidth = 1.4 * this.game.unit;
      ctx.stroke();
      ctx.restore();
    }

    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.hitFlash * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * (2.4 - this.hitFlash), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
