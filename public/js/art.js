/*
 * Every visual in the game is drawn with Canvas2D vector code and pre-rendered
 * into offscreen bitmaps once per resize. No image assets, no sprite sheets.
 */

import { TAU, rand, clamp } from './util.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* --------------------------------------------------------------- painters -- */

/**
 * Chicken, drawn in a box of `s` pixels with the origin at the centre.
 * Used for the flock, for chicks and (scaled up) for bosses.
 */
export function paintChicken(ctx, s, opts = {}) {
  const {
    body = '#fdfdf6',
    shade = '#d8d5c0',
    comb = '#e8443a',
    beak = '#f5a623',
    legs = '#f0932b',
    wing = 0, // -1 up .. 1 down
    armor = null,
    eye = '#1a1a24',
    angry = false,
  } = opts;

  const r = s * 0.5;
  ctx.save();
  ctx.translate(0, 0);

  // Legs
  ctx.strokeStyle = legs;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.24, r * 0.55);
    ctx.lineTo(sx * r * 0.3, r * 0.88);
    ctx.moveTo(sx * r * 0.3, r * 0.88);
    ctx.lineTo(sx * r * 0.12, r * 0.99);
    ctx.moveTo(sx * r * 0.3, r * 0.88);
    ctx.lineTo(sx * r * 0.5, r * 0.99);
    ctx.stroke();
  }

  // Tail feathers
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.05);
  ctx.quadraticCurveTo(-r * 1.02, -r * 0.42, -r * 0.86, r * 0.12);
  ctx.quadraticCurveTo(-r * 0.98, r * 0.2, -r * 0.5, r * 0.3);
  ctx.closePath();
  ctx.fill();

  // Body
  const grad = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, body);
  grad.addColorStop(1, shade);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 0.78, r * 0.66, 0, 0, TAU);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.ellipse(r * 0.3, -r * 0.42, r * 0.42, r * 0.38, 0, 0, TAU);
  ctx.fill();

  // Comb
  ctx.fillStyle = comb;
  ctx.beginPath();
  ctx.moveTo(r * 0.16, -r * 0.72);
  for (let i = 0; i < 3; i++) {
    const x = r * (0.16 + i * 0.16);
    ctx.quadraticCurveTo(x + r * 0.04, -r * 1.02, x + r * 0.16, -r * 0.74);
  }
  ctx.closePath();
  ctx.fill();

  // Wattle
  ctx.beginPath();
  ctx.ellipse(r * 0.5, -r * 0.14, r * 0.1, r * 0.15, 0, 0, TAU);
  ctx.fill();

  // Beak
  ctx.fillStyle = beak;
  ctx.beginPath();
  ctx.moveTo(r * 0.62, -r * 0.46);
  ctx.lineTo(r * 1.02, -r * 0.34);
  ctx.lineTo(r * 0.62, -r * 0.2);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(r * 0.44, -r * 0.5, r * 0.14, r * 0.15, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.ellipse(r * 0.48, -r * 0.48, r * 0.075, r * 0.09, 0, 0, TAU);
  ctx.fill();
  if (angry) {
    ctx.strokeStyle = comb;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(r * 0.28, -r * 0.74);
    ctx.lineTo(r * 0.64, -r * 0.58);
    ctx.stroke();
  }

  // Wing (flap frame)
  const wa = wing * 0.85;
  ctx.save();
  ctx.translate(-r * 0.12, -r * 0.02);
  ctx.rotate(wa);
  const wg = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.4);
  wg.addColorStop(0, body);
  wg.addColorStop(1, shade);
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 0.46, r * 0.26, -0.25, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.restore();

  // Optional armour plating (metal chickens)
  if (armor) {
    ctx.strokeStyle = armor;
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.08, r * 0.7, r * 0.58, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.16, r * 0.2, r * 0.1, -0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, r * 0.08);
    ctx.lineTo(r * 0.6, r * 0.08);
    ctx.stroke();
  }

  ctx.restore();
}

/** Player ship: sleek blue/white fighter pointing up. */
export function paintShip(ctx, s, opts = {}) {
  const { hull = '#dfe9ff', accent = '#3aa0ff', dark = '#1b2a44', glass = '#8fe6ff' } = opts;
  const r = s * 0.5;

  // Wings
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.5);
  ctx.lineTo(r * 0.92, r * 0.5);
  ctx.lineTo(r * 0.5, r * 0.62);
  ctx.lineTo(0, r * 0.2);
  ctx.lineTo(-r * 0.5, r * 0.62);
  ctx.lineTo(-r * 0.92, r * 0.5);
  ctx.closePath();
  ctx.fill();

  // Engine pods
  ctx.fillStyle = dark;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(sx * r * 0.72 - r * 0.13, r * 0.24, r * 0.26, r * 0.5, r * 0.1)
      : ctx.rect(sx * r * 0.72 - r * 0.13, r * 0.24, r * 0.26, r * 0.5);
    ctx.fill();
  }

  // Fuselage
  const g = ctx.createLinearGradient(-r * 0.3, 0, r * 0.35, 0);
  g.addColorStop(0, '#9fb4d8');
  g.addColorStop(0.45, hull);
  g.addColorStop(1, '#7f96bd');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.34, -r * 0.25, r * 0.3, r * 0.68);
  ctx.lineTo(-r * 0.3, r * 0.68);
  ctx.quadraticCurveTo(-r * 0.34, -r * 0.25, 0, -r);
  ctx.closePath();
  ctx.fill();

  // Nose cannon
  ctx.fillStyle = dark;
  ctx.fillRect(-r * 0.07, -r * 1.02, r * 0.14, r * 0.3);

  // Canopy
  const cg = ctx.createLinearGradient(0, -r * 0.55, 0, r * 0.1);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.5, glass);
  cg.addColorStop(1, '#2f6fa8');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.22, r * 0.17, r * 0.32, 0, 0, TAU);
  ctx.fill();

  // Panel lines
  ctx.strokeStyle = 'rgba(20,30,50,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.015);
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.34);
  ctx.lineTo(r * 0.3, r * 0.34);
  ctx.stroke();
}

function paintEgg(ctx, s, color = '#fffbe8', shade = '#e2d7b0') {
  const r = s * 0.5;
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.66, r * 0.88, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.34, r * 0.14, r * 0.22, -0.3, 0, TAU);
  ctx.fill();
}

function paintDrumstick(ctx, s) {
  const r = s * 0.5;
  ctx.save();
  ctx.rotate(-0.5);
  // Bone
  ctx.fillStyle = '#f4efdf';
  ctx.strokeStyle = '#d8cfb4';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(-r * 0.12, -r * 0.92, r * 0.24, r * 0.7, r * 0.1)
    : ctx.rect(-r * 0.12, -r * 0.92, r * 0.24, r * 0.7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.86, r * 0.15, 0, TAU);
  ctx.arc(r * 0.15, -r * 0.86, r * 0.15, 0, TAU);
  ctx.fill();
  // Meat
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.1, r * 0.1, 0, r * 0.15, r * 0.8);
  g.addColorStop(0, '#e59b52');
  g.addColorStop(0.7, '#c9762f');
  g.addColorStop(1, '#a15a1d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.16, r * 0.5, r * 0.62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,235,190,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.16, r * 0.02, r * 0.14, r * 0.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function paintGift(ctx, s, color = '#ff4d6d', ribbon = '#ffe066', label = '') {
  const r = s * 0.5;
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, color);
  g.addColorStop(1, '#00000055');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.18)
    : ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = ribbon;
  ctx.fillRect(-r * 0.14, -r * 0.8, r * 0.28, r * 1.6);
  ctx.fillRect(-r * 0.8, -r * 0.14, r * 1.6, r * 0.28);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.roundRect
    ? ctx.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.18)
    : ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#1a1a24';
    ctx.font = `bold ${Math.round(s * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, s * 0.02);
  }
}

function paintAsteroid(ctx, s, seed = 1, color = '#8a7f75') {
  const r = s * 0.5;
  const pts = 11;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * TAU;
    const wob = 0.72 + 0.28 * Math.abs(Math.sin(i * 2.3 + seed * 5.1));
    const rad = r * wob;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r);
  g.addColorStop(0, '#b9aca0');
  g.addColorStop(0.6, color);
  g.addColorStop(1, '#4f4741');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  // Craters
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 4; i++) {
    const a = seed * 3 + i * 1.7;
    const d = r * (0.15 + 0.45 * ((i * 7 + seed * 3) % 10) / 10);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.12, r * 0.09, a, 0, TAU);
    ctx.fill();
  }
}

function paintMissileIcon(ctx, s) {
  const r = s * 0.5;
  ctx.fillStyle = '#e8e8f0';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.quadraticCurveTo(r * 0.34, -r * 0.3, r * 0.28, r * 0.55);
  ctx.lineTo(-r * 0.28, r * 0.55);
  ctx.quadraticCurveTo(-r * 0.34, -r * 0.3, 0, -r * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff5252';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.quadraticCurveTo(r * 0.2, -r * 0.55, r * 0.14, -r * 0.3);
  ctx.lineTo(-r * 0.14, -r * 0.3);
  ctx.quadraticCurveTo(-r * 0.2, -r * 0.55, 0, -r * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff9f43';
  ctx.beginPath();
  ctx.moveTo(-r * 0.28, r * 0.2);
  ctx.lineTo(-r * 0.6, r * 0.7);
  ctx.lineTo(-r * 0.28, r * 0.62);
  ctx.closePath();
  ctx.moveTo(r * 0.28, r * 0.2);
  ctx.lineTo(r * 0.6, r * 0.7);
  ctx.lineTo(r * 0.28, r * 0.62);
  ctx.closePath();
  ctx.fill();
}

function paintFeather(ctx, s, color = '#ffffff') {
  const r = s * 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.7, 0, 0, r);
  ctx.quadraticCurveTo(-r * 0.7, 0, 0, -r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,180,190,0.8)';
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
}

function paintUfo(ctx, s) {
  const r = s * 0.5;
  const g = ctx.createLinearGradient(0, -r * 0.2, 0, r * 0.4);
  g.addColorStop(0, '#cfd8e3');
  g.addColorStop(1, '#5d6b7d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.15, r * 0.95, r * 0.3, 0, 0, TAU);
  ctx.fill();
  const dome = ctx.createRadialGradient(-r * 0.2, -r * 0.35, r * 0.05, 0, -r * 0.1, r * 0.6);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(0.5, '#8fe6ff');
  dome.addColorStop(1, '#2b7fb8');
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.05, r * 0.45, r * 0.42, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.32, r * 0.24, r * 0.07, 0, TAU);
    ctx.fill();
  }
}

/* -------------------------------------------------------------- sprite set -- */

export class Art {
  constructor() {
    this.cache = {};
    this.unit = 1;
    this.dpr = 1;
  }

  /**
   * Rebuild all bitmaps for the current unit scale. Called on boot and on
   * every meaningful resize/orientation change.
   */
  build(unit, dpr) {
    this.unit = unit;
    this.dpr = clamp(dpr, 1, 2.5);
    const c = {};
    const S = (px) => px * unit * this.dpr;

    const sprite = (size, drawFn, pad = 1.35) => {
      const box = Math.ceil(size * pad);
      const cv = makeCanvas(box, box);
      const g = cv.getContext('2d');
      g.translate(box / 2, box / 2);
      drawFn(g, size);
      cv.drawScale = 1 / this.dpr; // logical px per bitmap px
      return cv;
    };

    // Chicken flock: 4 breeds x 3 wing frames.
    const breeds = {
      white: { body: '#fdfdf6', shade: '#ded9c2', comb: '#e8443a' },
      brown: { body: '#e8b878', shade: '#c1854a', comb: '#d13a2f' },
      metal: { body: '#c9d2dc', shade: '#7f8b99', comb: '#ef5350', armor: '#8c99a8', angry: true },
      chick: { body: '#ffe066', shade: '#f0b429', comb: '#ff8a5c', legs: '#e08e0b' },
      boss: { body: '#f6e7c1', shade: '#c9a35d', comb: '#c62828', angry: true },
    };
    for (const [name, style] of Object.entries(breeds)) {
      const size = S(name === 'chick' ? 26 : name === 'boss' ? 120 : 40);
      c[`chicken_${name}`] = [-1, 0, 1].map((w) =>
        sprite(size, (g, s) => paintChicken(g, s, { ...style, wing: w }))
      );
    }

    c.ship = sprite(S(44), (g, s) => paintShip(g, s));
    c.shipGhost = sprite(S(44), (g, s) => paintShip(g, s, { hull: '#ffd7d7', accent: '#ff6b6b' }));
    c.egg = sprite(S(16), (g, s) => paintEgg(g, s));
    c.eggBig = sprite(S(26), (g, s) => paintEgg(g, s, '#ffe9c4', '#d4a95c'));
    c.drumstick = sprite(S(24), (g, s) => paintDrumstick(g, s));
    c.giftWeapon = sprite(S(26), (g, s) => paintGift(g, s, '#ff4d6d', '#ffe066'));
    c.giftPower = sprite(S(26), (g, s) => paintGift(g, s, '#37b24d', '#e9fac8', '+'));
    c.giftMissile = sprite(S(26), (g, s) => paintGift(g, s, '#4c6ef5', '#dbe4ff'));
    c.giftShield = sprite(S(26), (g, s) => paintGift(g, s, '#15aabf', '#c5f6fa'));
    c.giftLife = sprite(S(26), (g, s) => paintGift(g, s, '#f783ac', '#fff0f6'));
    c.missile = sprite(S(20), (g, s) => paintMissileIcon(g, s));
    c.ufo = sprite(S(46), (g, s) => paintUfo(g, s));
    c.asteroid = [0, 1, 2].map((i) => sprite(S(46), (g, s) => paintAsteroid(g, s, i + 1)));
    c.asteroidSmall = [0, 1, 2].map((i) => sprite(S(24), (g, s) => paintAsteroid(g, s, i + 3, '#6f665e')));
    c.feather = [0, 1].map((i) =>
      sprite(S(12), (g, s) => paintFeather(g, s, i ? '#ffe9a8' : '#ffffff'))
    );

    this.cache = c;
    return c;
  }

  get(key) {
    return this.cache[key];
  }

  /**
   * Draw a pre-rendered sprite centred on (x,y) in logical pixels.
   * `scale` multiplies the baked size, `rot` rotates around the centre.
   */
  draw(ctx, key, x, y, rot = 0, scale = 1, alpha = 1, frame = 0) {
    let cv = this.cache[key];
    if (!cv) return;
    if (Array.isArray(cv)) cv = cv[frame % cv.length];
    const w = (cv.width / this.dpr) * scale;
    const h = (cv.height / this.dpr) * scale;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(cv, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Logical radius of a sprite, useful for tuning hitboxes. */
  radius(key, frame = 0) {
    let cv = this.cache[key];
    if (!cv) return 10;
    if (Array.isArray(cv)) cv = cv[frame];
    return cv.width / this.dpr / 2;
  }
}

/* --------------------------------------------------------------- starfield -- */

export class Starfield {
  constructor() {
    this.layers = [];
  }

  init(w, h, unit) {
    this.w = w;
    this.h = h;
    const density = clamp((w * h) / 9000, 40, 190);
    this.layers = [
      { speed: 14 * unit, size: 1.0 * unit, stars: [], alpha: 0.5, n: Math.floor(density * 0.5) },
      { speed: 34 * unit, size: 1.5 * unit, stars: [], alpha: 0.75, n: Math.floor(density * 0.32) },
      { speed: 68 * unit, size: 2.2 * unit, stars: [], alpha: 1, n: Math.floor(density * 0.18) },
    ];
    for (const layer of this.layers) {
      for (let i = 0; i < layer.n; i++) {
        layer.stars.push({
          x: rand(w),
          y: rand(h),
          tw: rand(TAU),
          hue: rand(1) < 0.15 ? rand(60, 20) : 0,
        });
      }
    }
    // Distant nebula clouds, baked once.
    this.nebula = makeCanvas(w, h);
    const g = this.nebula.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const x = rand(w);
      const y = rand(h);
      const r = rand(Math.max(w, h) * 0.55, Math.max(w, h) * 0.2);
      const hue = [255, 285, 200, 320, 220][i];
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.16)`);
      grad.addColorStop(1, 'hsla(0,0%,0%,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
  }

  update(dt, boost = 1) {
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * boost * dt;
        s.tw += dt * 3;
        if (s.y > this.h + 2) {
          s.y = -2;
          s.x = rand(this.w);
        }
      }
    }
  }

  draw(ctx) {
    if (this.nebula) ctx.drawImage(this.nebula, 0, 0);
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const tw = 0.65 + 0.35 * Math.sin(s.tw);
        ctx.globalAlpha = layer.alpha * tw;
        ctx.fillStyle = s.hue ? `hsl(${s.hue}, 90%, 75%)` : '#ffffff';
        ctx.fillRect(s.x, s.y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
