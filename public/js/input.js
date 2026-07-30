/*
 * Unified input: touch drag (mobile-first), mouse, keyboard and gamepad.
 * The game loop only ever reads the resolved axis/flag state below.
 */

import { clamp } from './util.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;

    // Resolved state consumed by the game each frame.
    this.axisX = 0;
    this.axisY = 0;
    this.pointerActive = false;
    this.pointerX = 0;
    this.pointerY = 0;
    this.dragDX = 0; // accumulated drag offset since the touch started
    this.dragDY = 0;
    this.dragStarted = false; // one-frame edge
    this.firing = false;
    this.missileEdge = false;
    this.anyEdge = false;

    this.keys = new Set();
    this.pointers = new Map();
    this.primaryId = null;
    this.onPause = null;
    this.onMissile = null;
    this.onConfirm = null;
    this.enabled = false;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    const opts = { passive: false };

    c.addEventListener('pointerdown', (e) => this._down(e), opts);
    window.addEventListener('pointermove', (e) => this._move(e), opts);
    window.addEventListener('pointerup', (e) => this._up(e), opts);
    window.addEventListener('pointercancel', (e) => this._up(e), opts);

    // Stop iOS Safari from scrolling / rubber-banding the page while playing.
    c.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    c.addEventListener('touchmove', (e) => e.preventDefault(), opts);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  _local(e) {
    const rect = this.canvas.getBoundingClientRect();
    // Coordinates are returned in playfield space (see Game.resize letterboxing).
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.logicalWidth - (this.canvas.playOffsetX || 0),
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.logicalHeight,
    };
  }

  _down(e) {
    if (!this.enabled) return;
    const p = this._local(e);
    this.pointers.set(e.pointerId, { ...p, startX: p.x, startY: p.y });
    this.anyEdge = true;

    if (this.primaryId === null) {
      this.primaryId = e.pointerId;
      this.pointerActive = true;
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.dragDX = 0;
      this.dragDY = 0;
      this.dragStarted = true;
      this.firing = true;
    } else {
      // A second finger launches a missile – quick to reach on a phone.
      this.missileEdge = true;
      if (this.onMissile) this.onMissile();
    }
    if (this.canvas.setPointerCapture && e.pointerType !== 'touch') {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
  }

  _move(e) {
    if (!this.enabled) return;
    const tracked = this.pointers.get(e.pointerId);
    const p = this._local(e);
    if (tracked) {
      tracked.x = p.x;
      tracked.y = p.y;
    }
    if (e.pointerId === this.primaryId) {
      this.dragDX += p.x - this.pointerX;
      this.dragDY += p.y - this.pointerY;
      this.pointerX = p.x;
      this.pointerY = p.y;
    } else if (this.primaryId === null && e.pointerType === 'mouse') {
      // Mouse hover still steers the ship on desktop.
      this.pointerX = p.x;
      this.pointerY = p.y;
      this.hovering = true;
    }
  }

  _up(e) {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.primaryId) {
      this.primaryId = null;
      this.pointerActive = false;
      this.firing = false;
      // Promote a still-held finger to primary so movement survives.
      for (const [id, p] of this.pointers) {
        this.primaryId = id;
        this.pointerActive = true;
        this.pointerX = p.x;
        this.pointerY = p.y;
        this.dragDX = 0;
        this.dragDY = 0;
        this.dragStarted = true;
        this.firing = true;
        break;
      }
    }
  }

  _key(e, down) {
    const k = e.key.toLowerCase();
    const codes = [
      'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
      'a', 'd', 'w', 's', ' ', 'x', 'z', 'p', 'escape', 'enter', 'shift', 'control',
    ];
    if (!codes.includes(k)) return;
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (!this.enabled && !(k === 'enter' || k === 'escape' || k === 'p')) return;

    if (down) {
      if (this.keys.has(k)) return; // ignore auto-repeat
      this.keys.add(k);
      this.anyEdge = true;
      if (k === 'p' || k === 'escape') {
        if (this.onPause) this.onPause();
      } else if (k === 'x' || k === 'z' || k === 'control') {
        this.missileEdge = true;
        if (this.onMissile) this.onMissile();
      } else if (k === 'enter') {
        if (this.onConfirm) this.onConfirm();
      }
    } else {
      this.keys.delete(k);
    }
  }

  /** Called once per frame before the game reads state. */
  poll() {
    const k = this.keys;
    let ax = 0;
    let ay = 0;
    if (k.has('arrowleft') || k.has('a')) ax -= 1;
    if (k.has('arrowright') || k.has('d')) ax += 1;
    if (k.has('arrowup') || k.has('w')) ay -= 1;
    if (k.has('arrowdown') || k.has('s')) ay += 1;

    // Gamepad (optional, desktop / TV browsers).
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const [lx, ly] = pad.axes;
      if (Math.abs(lx) > 0.18) ax += lx;
      if (Math.abs(ly) > 0.18) ay += ly;
      if (pad.buttons[0] && pad.buttons[0].pressed) this.padFire = true;
      else this.padFire = false;
      if (pad.buttons[1] && pad.buttons[1].pressed) {
        if (!this._padMissile) {
          this.missileEdge = true;
          if (this.onMissile) this.onMissile();
        }
        this._padMissile = true;
      } else this._padMissile = false;
      if (pad.buttons[9] && pad.buttons[9].pressed) {
        if (!this._padStart && this.onPause) this.onPause();
        this._padStart = true;
      } else this._padStart = false;
      break;
    }

    this.axisX = clamp(ax, -1, 1);
    this.axisY = clamp(ay, -1, 1);
    this.keyboardFire = k.has(' ') || !!this.padFire;
  }

  /** Clear the one-frame edges. Called at the end of each frame. */
  endFrame() {
    this.dragStarted = false;
    this.missileEdge = false;
    this.anyEdge = false;
    this.dragDX = 0;
    this.dragDY = 0;
  }

  reset() {
    this.keys.clear();
    this.pointers.clear();
    this.primaryId = null;
    this.pointerActive = false;
    this.firing = false;
    this.axisX = 0;
    this.axisY = 0;
    this.dragDX = 0;
    this.dragDY = 0;
  }
}
