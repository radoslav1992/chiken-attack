/*
 * Whittle & Wares — the run.
 *
 * One class holds a whole run: the day, the satchel, the shop, the rent. It owns
 * the forage phase entirely (that half is a canvas game and wants a loop), and
 * for the management phases it owns only the state and emits events — main.js
 * renders those as DOM, because a shop ledger built out of canvas text is a
 * worse ledger and an unreadable one for anybody using a screen reader.
 *
 * The rule the whole file follows: every number that decides anything lives in
 * economy.js, where the balance simulation can reach it. If a constant in here
 * could change whether a run is winnable, it is in the wrong file.
 */

import {
  makeRng, ITEMS, RECIPES, UPGRADES, UPGRADE_BY_ID, ZONES, zoneOpen,
  rentDue, RENT_EVERY, dailyMarket, customerCount, makeCustomer, evaluateOffer,
  repDelta, suggestedPrice, stockCapacity, maxStamina, nodeYield, canCraft,
  spoil, countStock,
} from './economy.js';
import { generate, reachable, solid, TILE, MAP_W, MAP_H, T, bandOfRow } from './world.js';
import { beaverFrame, waspSprite, tileArt, nodeSprite, blit, PAL } from './art.js';
import { sfx } from './audio.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* Forage-phase constants. These three are the ones that must agree with
 * economy.js's NODE_COST of 7: a gather costs GATHER_COST, and the walk to the
 * next node costs roughly two seconds of MOVE_DRAIN. Change one and re-run
 * ww-balance.mjs, because the whole economy is denominated in nodes per day. */
const SPEED = 62; // pixels per second
const MOVE_DRAIN = 0.55; // stamina per second while walking
const GATHER_COST = 5;
const GATHER_TIME = 0.45; // how long you must stand on a node
const STING_COST = 12;
const WASP_RANGE = 3 * TILE;
const BODY = 5; // half-width of the collision box

export const DAYS_TARGET = 30;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hooks = {};
    this.phase = 'menu'; // menu | forage | craft | shop | evening | over
    this._raf = null;
    this._last = 0;
    this.keys = new Set();
    this.stick = null;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* The loop starts at boot, on the menu, before any run exists — so these
     * have to be real from the constructor. Left undefined they threw once a
     * frame behind the title screen, which nothing on screen would ever show. */
    this.floats = [];
    this.hint = '';
    this.hintT = 0;
    this.inv = {};
    this.upgrades = [];
    this.day = 0;
    this.gold = 0;
    this.stamina = 0;
    this.maxStam = 1;
    this.resize();
  }

  on(name, fn) {
    (this.hooks[name] || (this.hooks[name] = [])).push(fn);
  }

  emit(name, ...args) {
    const list = this.hooks[name];
    if (!list) return;
    for (const fn of list) fn(...args);
  }

  /* ---------------------------------------------------------------- sizing -- */

  resize() {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(200, Math.round(rect.width || window.innerWidth));
    this.h = Math.max(240, Math.round(rect.height || window.innerHeight));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* Integer zoom only. A pixel game at 2.4x has seams between tiles that no
     * amount of care in the art can hide, so the view shows a few more or fewer
     * tiles rather than a fractional scale. */
    this.zoom = clamp(Math.round(Math.min(this.w / 236, this.h / 300)), 2, 5);
    this.ctx.imageSmoothingEnabled = false;
  }

  /* ------------------------------------------------------------------ run -- */

  newRun(seed) {
    this.seed = (seed || Math.floor(Math.random() * 1e9)) >>> 0;
    this.day = 0;
    this.gold = 60;
    this.rep = 0;
    this.inv = {};
    this.ages = {};
    this.upgrades = [];
    this.prices = {};
    this.takings = 0;
    this.sold = 0;
    this.walkouts = 0;
    this.bestDay = 0;
    this.overReason = '';
    this.startDay();
  }

  snapshot() {
    return {
      v: 1,
      seed: this.seed, day: this.day, gold: this.gold, rep: this.rep,
      inv: this.inv, ages: this.ages, upgrades: this.upgrades, prices: this.prices,
      takings: this.takings, sold: this.sold, walkouts: this.walkouts,
    };
  }

  restore(s) {
    if (!s || s.v !== 1) return false;
    this.seed = s.seed;
    this.day = s.day - 1; // startDay steps it forward
    this.gold = s.gold;
    this.rep = s.rep;
    this.inv = s.inv || {};
    this.ages = s.ages || {};
    this.upgrades = s.upgrades || [];
    this.prices = s.prices || {};
    this.takings = s.takings || 0;
    this.sold = s.sold || 0;
    this.walkouts = s.walkouts || 0;
    this.overReason = '';
    this.startDay();
    return true;
  }

  /* ------------------------------------------------------------- the day -- */

  startDay() {
    this.day++;
    this.rng = makeRng(this.seed * 2654435761 + this.day * 40503);
    this.market = dailyMarket(this.day, this.rng);
    this.map = generate(this.day, this.upgrades, this.rng);
    this.reach = reachable(this.map, this.upgrades);

    this.stamina = maxStamina(this.upgrades);
    this.maxStam = this.stamina;
    this.gathered = 0;
    this.dayTakings = 0;
    this.daySold = 0;
    this.dayWalkouts = 0;

    const s = this.map.spawn;
    this.px = s.x * TILE + TILE / 2;
    this.py = s.y * TILE + TILE / 2;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.animT = 0;
    this.gatherT = 0;
    this.gatherTarget = null;
    this.stun = 0;
    this.wasps = [];
    this.floats = [];
    this.hint = '';
    this.hintT = 0;

    this.phase = 'forage';
    /* Saved at the START of the day, so the snapshot means "the day you are
     * about to play". Saved at the end of sleep() it meant the day just
     * finished, and restoring rewound the player by one day and one lot of
     * takings. */
    this.emit('save');
    this.emit('phase', 'forage');
    this.emit('hud');
    this.say(`Day ${this.day} — ${this.market.hot.map((h) => ITEMS[h].name).join(' and ')} are wanted today`, 3.4);
    sfx.day();
  }

  say(text, t = 2.2) {
    this.hint = text;
    this.hintT = t;
  }

  /* ------------------------------------------------------------ the loop -- */

  start() {
    if (this._raf) return;
    this._last = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > 0.25) dt = 1 / 60;
      if (this.phase === 'forage') this.stepForage(dt);
      this.hintT = Math.max(0, this.hintT - dt);
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.life -= dt;
        f.y -= 22 * dt;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      if (this.phase === 'forage') this.render();
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /* --------------------------------------------------------------- input -- */

  key(k, down) {
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  }

  /** Touch stick: a normalised direction, or null when the thumb is off. */
  setStick(v) {
    this.stick = v;
  }

  wish() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('left')) x -= 1;
    if (k.has('right')) x += 1;
    if (k.has('up')) y -= 1;
    if (k.has('down')) y += 1;
    if (this.stick) {
      x += this.stick.x;
      y += this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, len: Math.min(1, len) };
  }

  /* ------------------------------------------------------------- foraging -- */

  stepForage(dt) {
    if (this.stun > 0) {
      this.stun -= dt;
    } else {
      const w = this.wish();
      this.vx = w.x * SPEED;
      this.vy = w.y * SPEED;
      if (w.len > 0.05) {
        this.moveBy(this.vx * dt, this.vy * dt);
        this.stamina -= MOVE_DRAIN * dt * w.len;
        this.animT += dt * (4 + w.len * 4);
        if (Math.abs(w.x) > 0.2) this.facing = w.x > 0 ? 1 : -1;
      } else {
        this.animT = 0;
      }
    }

    this.checkGather(dt);
    this.stepWasps(dt);

    // Home is a tile, not a button: walk to the door and the day moves on.
    const tx = Math.floor(this.px / TILE);
    const ty = Math.floor(this.py / TILE);
    if (this.map.tiles[ty * MAP_W + tx] === T.door) {
      this.goHome('You are back at the shop.');
      return;
    }

    if (this.stamina <= 0) {
      this.stamina = 0;
      this.goHome('Worn out. You trudge home with what you have.');
    }

    this.emit('hud');
  }

  moveBy(dx, dy) {
    // Axis by axis, so sliding along a wall works instead of sticking to it.
    if (dx) {
      const nx = this.px + dx;
      if (!this.blocked(nx, this.py)) this.px = nx;
    }
    if (dy) {
      const ny = this.py + dy;
      if (!this.blocked(this.px, ny)) this.py = ny;
    }
    this.px = clamp(this.px, TILE, (MAP_W - 1) * TILE);
    this.py = clamp(this.py, TILE, (MAP_H - 1) * TILE);
  }

  blocked(x, y) {
    for (const [ox, oy] of [[-BODY, -BODY], [BODY, -BODY], [-BODY, BODY], [BODY, BODY]]) {
      const tx = Math.floor((x + ox) / TILE);
      const ty = Math.floor((y + oy) / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      const code = this.map.tiles[ty * MAP_W + tx];
      if (solid(code, this.upgrades)) {
        // A locked gate says why, once, instead of feeling like a bug.
        if (code === T.gateAxe && this.hintT <= 0) this.say('Brambles. A steel axe would cut these.');
        if (code === T.gateLantern && this.hintT <= 0) this.say('Too dark to go on. You would need a lantern.');
        return true;
      }
    }
    return false;
  }

  checkGather(dt) {
    let near = null;
    let bestD = 14;
    for (const n of this.map.nodes) {
      if (n.taken) continue;
      const d = Math.hypot(this.px - (n.x * TILE + TILE / 2), this.py - (n.y * TILE + TILE / 2));
      if (d < bestD) {
        bestD = d;
        near = n;
      }
    }
    if (near !== this.gatherTarget) {
      this.gatherTarget = near;
      this.gatherT = 0;
    }
    if (!near) return;
    if (this.stamina < GATHER_COST) {
      if (this.hintT <= 0) this.say('Too tired to gather. Head home.');
      return;
    }
    this.gatherT += dt;
    if (this.gatherT < GATHER_TIME) return;

    this.gatherT = 0;
    near.taken = true;
    this.stamina -= GATHER_COST;
    const n = nodeYield(this.upgrades, this.rng);
    this.inv[near.item] = (this.inv[near.item] || 0) + n;
    this.gathered += n;
    this.floats.push({
      x: near.x * TILE + TILE / 2,
      y: near.y * TILE,
      text: `+${n} ${ITEMS[near.item].name}`,
      colour: ITEMS[near.item].colour,
      life: 1.1,
    });
    sfx.gather();
    sfx.found(near.zone);

    // Gathering beside a nest wakes it. This is why the deep wood costs more
    // than the walk there.
    for (const h of this.map.hazards) {
      if (h.zone !== near.zone) continue;
      const d = Math.hypot(near.x - h.x, near.y - h.y) * TILE;
      if (d < WASP_RANGE * 1.6 && this.wasps.length < 8) {
        this.wasps.push({ x: h.x * TILE + 8, y: h.y * TILE + 8, life: 4.5, cool: 0 });
        sfx.sting();
      }
    }
  }

  stepWasps(dt) {
    for (let i = this.wasps.length - 1; i >= 0; i--) {
      const w = this.wasps[i];
      w.life -= dt;
      w.cool = Math.max(0, w.cool - dt);
      const dx = this.px - w.x;
      const dy = this.py - w.y;
      const d = Math.hypot(dx, dy) || 1;
      w.x += (dx / d) * 44 * dt;
      w.y += (dy / d) * 44 * dt;
      if (d < 10 && w.cool <= 0) {
        w.cool = 1.2;
        this.stamina -= STING_COST;
        this.stun = 0.45;
        this.floats.push({ x: this.px, y: this.py - 10, text: `−${STING_COST}`, colour: '#ff6b5b', life: 0.9 });
        sfx.sting();
      }
      if (w.life <= 0) this.wasps.splice(i, 1);
    }
  }

  /** End the morning wherever the player is. */
  goHome(reason) {
    this.wasps.length = 0;
    this.phase = this.upgrades.includes('bench') ? 'craft' : 'shop';
    if (this.phase === 'shop') this.prepareShop();
    this.emit('phase', this.phase, reason);
    this.emit('hud');
  }

  /* -------------------------------------------------------------- crafting -- */

  craftable() {
    return Object.keys(RECIPES).filter((id) => canCraft(this.inv, id));
  }

  craft(id) {
    if (!this.upgrades.includes('bench') || !canCraft(this.inv, id)) return false;
    for (const k in RECIPES[id]) this.inv[k] -= RECIPES[id][k];
    this.inv[id] = (this.inv[id] || 0) + 1;
    sfx.craft();
    this.emit('hud');
    return true;
  }

  doneCrafting() {
    this.prepareShop();
    this.phase = 'shop';
    this.emit('phase', 'shop');
  }

  /* ------------------------------------------------------------ the shop -- */

  prepareShop() {
    /* Stock the shelves with the most valuable goods that fit. Doing it for the
     * player rather than making them drag items is a deliberate cut: the
     * interesting decision is the price, not the tetris. */
    const cap = stockCapacity(this.upgrades);
    this.shelf = {};
    let placed = 0;
    const order = Object.keys(this.inv)
      .filter((id) => this.inv[id] > 0)
      .sort((a, b) => ITEMS[b].value - ITEMS[a].value);
    for (const id of order) {
      while (this.inv[id] > 0 && placed < cap) {
        this.shelf[id] = (this.shelf[id] || 0) + 1;
        this.inv[id]--;
        placed++;
      }
    }
    for (const id in this.shelf) {
      if (this.prices[id] == null) this.prices[id] = suggestedPrice(id, this.market);
    }
    this.queue = [];
    this.customer = null;
    this.awaitingHaggle = false;
    this.shopOpen = false;
  }

  setPrice(id, v) {
    this.prices[id] = Math.max(1, Math.round(v));
    this.emit('shop');
  }

  openShop() {
    const n = customerCount(this.day, this.rep, this.upgrades, this.rng);
    this.queue = [];
    for (let i = 0; i < n; i++) this.queue.push(i);
    this.shopOpen = true;
    this.emit('phase', 'serving');
    this.nextCustomer();
  }

  onShelf() {
    return Object.keys(this.shelf).filter((id) => this.shelf[id] > 0);
  }

  nextCustomer() {
    this.awaitingHaggle = false;
    const stock = this.onShelf();
    if (!this.queue.length || !stock.length) {
      this.customer = null;
      this.endShop();
      return;
    }
    this.queue.pop();
    const c = makeCustomer(this.day, this.rep, this.market, stock, this.rng);
    c.qty = Math.min(c.qty, this.shelf[c.wants]);
    c.face = this.rng.int(0, 5);
    this.customer = c;

    const price = this.prices[c.wants];
    const verdict = evaluateOffer(c, price);
    if (verdict === 'buy') {
      this.sell(price);
    } else if (verdict === 'haggle') {
      c.haggled = true;
      this.awaitingHaggle = true;
      this.emit('customer', c, 'haggle');
    } else {
      this.walkOut();
    }
  }

  sell(unitPrice) {
    const c = this.customer;
    const qty = Math.min(c.qty, this.shelf[c.wants]);
    const total = unitPrice * qty;
    this.shelf[c.wants] -= qty;
    this.gold += total;
    this.dayTakings += total;
    this.takings += total;
    this.daySold += qty;
    this.sold += qty;
    this.rep = clamp(this.rep + repDelta('buy', c.wants, unitPrice), -60, 120);
    sfx.sale(qty);
    sfx.coin();
    this.emit('customer', c, 'sold', { qty, unitPrice, total });
    this.emit('hud');
    setTimeout(() => this.phase === 'shop' && this.nextCustomer(), this.reduceMotion ? 260 : 760);
  }

  walkOut() {
    const c = this.customer;
    this.rep = clamp(this.rep + repDelta('leave', c.wants, this.prices[c.wants]), -60, 120);
    this.dayWalkouts++;
    this.walkouts++;
    sfx.walkout();
    this.emit('customer', c, 'left');
    this.emit('hud');
    setTimeout(() => this.phase === 'shop' && this.nextCustomer(), this.reduceMotion ? 260 : 700);
  }

  /** Answer a haggle: take their offer, or hold the price and risk the sale. */
  answerHaggle(accept) {
    if (!this.awaitingHaggle || !this.customer) return;
    this.awaitingHaggle = false;
    if (accept) {
      this.sell(this.customer.wtp);
    } else {
      sfx.refuse();
      this.walkOut();
    }
  }

  endShop() {
    // Everything unsold goes back in the satchel.
    for (const id in this.shelf) {
      if (this.shelf[id] > 0) this.inv[id] = (this.inv[id] || 0) + this.shelf[id];
      this.shelf[id] = 0;
    }
    this.spoiled = spoil(this.inv, this.ages);
    if (Object.keys(this.spoiled).length) sfx.spoil();
    this.phase = 'evening';
    this.emit('phase', 'evening');
    this.emit('hud');
  }

  /* ----------------------------------------------------------- the evening -- */

  affordable(id) {
    const u = UPGRADE_BY_ID[id];
    return u && !this.upgrades.includes(id) && this.gold >= u.cost;
  }

  buyUpgrade(id) {
    if (!this.affordable(id)) return false;
    this.gold -= UPGRADE_BY_ID[id].cost;
    this.upgrades.push(id);
    sfx.buy();
    this.emit('hud');
    this.emit('evening');
    return true;
  }

  /** Rent falls at the end of every fifth day. This is the whole clock. */
  sleep() {
    const rent = rentDue(this.day);
    if (rent) {
      this.gold -= rent;
      sfx.rent();
      if (this.gold < 0) {
        this.overReason = `The rent came to ${rent} and you were ${-this.gold} short.`;
        this.gameOver();
        return;
      }
    }
    if (this.day >= DAYS_TARGET) {
      this.overReason = `You saw out all ${DAYS_TARGET} days with the shop still yours.`;
      this.gameOver(true);
      return;
    }
    this.startDay();
  }

  gameOver(won = false) {
    this.phase = 'over';
    this.won = won;
    sfx[won ? 'buy' : 'ruin']();
    this.emit('gameover', {
      score: Math.round(this.takings),
      day: this.day,
      gold: this.gold,
      won,
      reason: this.overReason,
      upgrades: this.upgrades.slice(),
      sold: this.sold,
    });
  }

  /* --------------------------------------------------------------- render -- */

  render() {
    const ctx = this.ctx;
    const z = this.zoom;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#101a14';
    ctx.fillRect(0, 0, this.w, this.h);

    // Camera: centred on the beaver, clamped so the view never leaves the map.
    const viewW = this.w / z;
    const viewH = this.h / z;
    const camX = clamp(this.px - viewW / 2, 0, MAP_W * TILE - viewW);
    const camY = clamp(this.py - viewH / 2, 0, MAP_H * TILE - viewH);

    ctx.save();
    ctx.scale(z, z);
    ctx.translate(-Math.round(camX), -Math.round(camY));

    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(MAP_W - 1, Math.ceil((camX + viewW) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(MAP_H - 1, Math.ceil((camY + viewH) / TILE));

    const NAMES = ['grass', 'path', 'flower', 'door', 'tree', 'rock', 'water', 'stump', 'gateAxe', 'gateLantern'];
    for (let y = y0; y <= y1; y++) {
      const band = bandOfRow(y);
      for (let x = x0; x <= x1; x++) {
        let code = this.map.tiles[y * MAP_W + x];
        // An opened gate is just path — the tool changed the world.
        if ((code === T.gateAxe || code === T.gateLantern) && !solid(code, this.upgrades)) code = T.path;
        ctx.drawImage(tileArt(NAMES[code] || 'grass', band), x * TILE, y * TILE);
      }
    }

    // Nodes, bobbing gently so they read as pickups rather than scenery.
    for (const n of this.map.nodes) {
      if (n.taken) continue;
      if (n.x < x0 - 1 || n.x > x1 + 1 || n.y < y0 - 1 || n.y > y1 + 1) continue;
      const bob = this.reduceMotion ? 0 : Math.sin(this.animT * 0.6 + n.x + n.y) * 0.8;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.fillRect(n.x * TILE + 4, n.y * TILE + 13, 8, 2);
      ctx.globalAlpha = 1;
      blit(ctx, nodeSprite(n.item, ITEMS[n.item].colour), n.x * TILE + 4, n.y * TILE + 3 + bob, 1);
    }

    // The gather ring: a filling arc, so the pause has a reason on screen.
    if (this.gatherTarget && this.gatherT > 0.02) {
      const n = this.gatherTarget;
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(n.x * TILE + 8, n.y * TILE + 8, 9, -Math.PI / 2, -Math.PI / 2 + (this.gatherT / GATHER_TIME) * Math.PI * 2);
      ctx.stroke();
    }

    // The beaver.
    const frame = this.animT > 0 ? (Math.floor(this.animT) % 2) : 0;
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.fillRect(this.px - 6, this.py + 4, 12, 3);
    ctx.globalAlpha = this.stun > 0 && Math.floor(this.stun * 20) % 2 ? 0.4 : 1;
    blit(ctx, beaverFrame(frame), this.px - 8, this.py - 10, 1, this.facing < 0);
    ctx.globalAlpha = 1;

    for (const w of this.wasps) blit(ctx, waspSprite(), w.x - 4, w.y - 4, 1);

    for (const f of this.floats) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.font = '6px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 0.6, f.y + 0.6);
      ctx.fillStyle = f.colour;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    this.drawOverlay(ctx);
  }

  drawOverlay(ctx) {
    /* Which band the player is standing in, named. Sits BELOW the DOM HUD, not
     * at the top of the canvas: the HUD is a separate layer over the same
     * corner, and at (10, 10) the two pieces of text printed straight through
     * each other. */
    const band = bandOfRow(Math.floor(this.py / TILE));
    const zone = ZONES[band];
    ctx.textAlign = 'left';
    ctx.font = '600 13px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(8,14,10,0.72)';
    const label = zoneOpen(zone, this.upgrades) ? zone.name : `${zone.name} — locked`;
    const wpx = ctx.measureText(label).width + 18;
    const top = 62 + (window.visualViewport ? 0 : 0);
    ctx.fillRect(10, top, wpx, 26);
    ctx.fillStyle = zoneOpen(zone, this.upgrades) ? '#e9f3df' : '#ffb08a';
    ctx.fillText(label, 19, top + 17);

    // A compass to the door, because the map is tall and it is easy to lose it.
    const doorY = (MAP_H - 2) * TILE;
    if (this.py < doorY - 120) {
      ctx.fillStyle = 'rgba(8,14,10,0.6)';
      ctx.fillRect(this.w - 46, this.h - 46, 36, 36);
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.moveTo(this.w - 28, this.h - 16);
      ctx.lineTo(this.w - 35, this.h - 30);
      ctx.lineTo(this.w - 21, this.h - 30);
      ctx.closePath();
      ctx.fill();
    }

    if (this.hintT > 0) {
      ctx.globalAlpha = clamp(this.hintT, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = '600 14px ui-rounded, system-ui, sans-serif';
      const t = this.hint;
      const w = ctx.measureText(t).width + 26;
      ctx.fillStyle = 'rgba(8,14,10,0.82)';
      ctx.fillRect((this.w - w) / 2, this.h - 92, w, 30);
      ctx.fillStyle = '#ffe9b8';
      ctx.fillText(t, this.w / 2, this.h - 72);
      ctx.globalAlpha = 1;
    }
  }
}

export { ITEMS, RECIPES, UPGRADES, UPGRADE_BY_ID, ZONES, rentDue, RENT_EVERY, suggestedPrice, countStock, stockCapacity, PAL };
