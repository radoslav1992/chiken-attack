/* Whittle & Wares boot: input, the DOM half of the game, persistence, PWA. */

import { Game, ITEMS, RECIPES, UPGRADES, UPGRADE_BY_ID, rentDue, RENT_EVERY, suggestedPrice, stockCapacity, DAYS_TARGET } from './game.js';
import { itemIcon, customerSprite } from './art.js';
import { sfx, unlock, setSound, soundOn } from './audio.js';

const $ = (s) => document.querySelector(s);
const show = (el, on) => el.classList.toggle('is-hidden', !on);

const canvas = $('#game');
const game = new Game(canvas);
window.__game = game;

/* ------------------------------------------------------------ persistence -- */

const SAVE_KEY = 'whittle-wares.save';
const BEST_KEY = 'whittle-wares.best';
const NAME_KEY = 'whittle-wares.name';

const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const traderName = {
  get: () => store.get(NAME_KEY, 'TRADER'),
  set: (v) => store.set(NAME_KEY, v),
};

/* ---------------------------------------------------------- global scores -- */

let lastRun = null;

function submitScore(result) {
  if (result.score <= 0) return;
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  lastRun = {
    id,
    game: 'whittle-wares',
    score: Math.floor(result.score),
    wave: result.day, // the day reached, same column as waves and metres
    difficulty: 'veteran',
  };
  pushScore();
}

function pushScore() {
  if (!lastRun) return;
  fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...lastRun, name: traderName.get() }),
  }).catch(() => {
    /* offline — the local best still stands */
  });
}

/* ----------------------------------------------------------------- screens -- */

const SCREENS = {
  menu: $('#screen-menu'),
  craft: $('#screen-craft'),
  shop: $('#screen-shop'),
  serving: $('#screen-serving'),
  evening: $('#screen-evening'),
  over: $('#screen-over'),
  pause: $('#screen-pause'),
};
const hudEl = $('#hud');

function showOnly(name) {
  for (const k in SCREENS) show(SCREENS[k], k === name);
  show(hudEl, name === null || name === 'forage');
}

function syncSoundButtons() {
  const label = soundOn() ? '♪ Sound on' : '✕ Sound off';
  $('#btn-sound').textContent = label;
  $('#btn-sound-2').textContent = label;
}

/* ------------------------------------------------------------------- icons -- */

/** An <img> of a baked pixel sprite, for the DOM lists. */
function iconImg(id) {
  const img = document.createElement('img');
  img.className = 'ico';
  img.alt = '';
  img.src = itemIcon(id, ITEMS[id].colour).toDataURL();
  return img;
}

const iconCache = new Map();
function icon(id) {
  if (!iconCache.has(id)) iconCache.set(id, itemIcon(id, ITEMS[id].colour).toDataURL());
  const img = document.createElement('img');
  img.className = 'ico';
  img.alt = '';
  img.src = iconCache.get(id);
  return img;
}
void iconImg;

/* -------------------------------------------------------------------- HUD -- */

const barStam = $('#bar-stamina');
const hudDay = $('#hud-day');
const hudGold = $('#hud-gold');
const hudSack = $('#hud-sack');

game.on('hud', () => {
  hudDay.textContent = `Day ${game.day}`;
  hudGold.textContent = Math.round(game.gold).toLocaleString('en-US');
  const frac = game.maxStam ? Math.max(0, game.stamina / game.maxStam) : 1;
  // A custom property, not an inline style attribute — the CSP refuses those.
  barStam.style.setProperty('--v', frac.toFixed(3));
  barStam.classList.toggle('is-low', frac < 0.25);
  let n = 0;
  for (const k in game.inv) n += game.inv[k];
  hudSack.textContent = `${n} in the satchel`;
});

/* ------------------------------------------------------------------ phases -- */

game.on('phase', (phase, reason) => {
  if (phase === 'forage') {
    showOnly('forage');
    return;
  }
  if (phase === 'craft') {
    renderCraft(reason);
    showOnly('craft');
    return;
  }
  if (phase === 'shop') {
    renderShop(reason);
    showOnly('shop');
    return;
  }
  if (phase === 'serving') {
    showOnly('serving');
    return;
  }
  if (phase === 'evening') {
    renderEvening();
    showOnly('evening');
  }
});

/* ------------------------------------------------------------------ craft -- */

function renderCraft(reason) {
  $('#craft-sub').textContent =
    (reason ? `${reason} ` : '') + 'Turn materials into goods worth more than their parts.';
  const list = $('#craft-list');
  list.textContent = '';
  for (const id of Object.keys(RECIPES)) {
    const li = document.createElement('li');
    li.append(icon(id));
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = `${ITEMS[id].name} · ${ITEMS[id].value} coin`;
    const sp = document.createElement('span');
    sp.textContent = Object.entries(RECIPES[id])
      .map(([k, v]) => `${v}x ${ITEMS[k].name} (have ${game.inv[k] || 0})`)
      .join(', ');
    nm.append(b, sp);
    li.append(nm);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini';
    btn.textContent = '+';
    btn.setAttribute('aria-label', `Craft ${ITEMS[id].name}`);
    btn.disabled = !game.craftable().includes(id);
    btn.addEventListener('click', () => {
      if (game.craft(id)) renderCraft();
    });
    li.append(btn);
    list.append(li);
  }
}

$('#btn-craft-done').addEventListener('click', () => {
  sfx.ui();
  game.doneCrafting();
});

/* ------------------------------------------------------------------- shop -- */

function renderShop(reason) {
  const m = game.market;
  const hot = m.hot.map((h) => ITEMS[h].name).join(' and ');
  $('#shop-market').textContent =
    `${reason ? reason + ' ' : ''}Wanted today: ${hot}. Nobody wants ${ITEMS[m.cold].name}.`;

  const list = $('#price-list');
  list.textContent = '';
  const stock = game.onShelf();
  if (!stock.length) {
    const li = document.createElement('li');
    li.textContent = 'The shelves are bare. Nothing to sell today.';
    list.append(li);
  }
  for (const id of stock) {
    const li = document.createElement('li');
    li.append(icon(id));
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = `${ITEMS[id].name} ×${game.shelf[id]}`;
    const sp = document.createElement('span');
    const sug = suggestedPrice(id, m);
    const tag = m.mult[id] >= 1.4 ? ' — wanted today' : m.mult[id] < 1 ? ' — glutted' : '';
    sp.textContent = `going rate ${sug}${tag}`;
    if (tag) sp.className = m.mult[id] >= 1.4 ? 'hot' : 'cold';
    nm.append(b, sp);
    li.append(nm);

    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'mini';
    dec.textContent = '−';
    dec.setAttribute('aria-label', `Lower the price of ${ITEMS[id].name}`);
    const val = document.createElement('span');
    val.className = 'price';
    val.textContent = game.prices[id];
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'mini';
    inc.textContent = '+';
    inc.setAttribute('aria-label', `Raise the price of ${ITEMS[id].name}`);

    const step = Math.max(1, Math.round(sug * 0.1));
    dec.addEventListener('click', () => {
      game.setPrice(id, game.prices[id] - step);
      val.textContent = game.prices[id];
      sfx.ui();
    });
    inc.addEventListener('click', () => {
      game.setPrice(id, game.prices[id] + step);
      val.textContent = game.prices[id];
      sfx.ui();
    });
    li.append(dec, val, inc);
    list.append(li);
  }

  const cap = stockCapacity(game.upgrades);
  let held = 0;
  for (const k in game.inv) held += game.inv[k];
  $('#shop-note').textContent = held
    ? `${held} more in the back — the shelves only hold ${cap}.`
    : `The shelves hold ${cap}.`;
}

$('#btn-open').addEventListener('click', () => {
  sfx.ui();
  game.openShop();
});

/* ---------------------------------------------------------------- serving -- */

const faceCv = $('#face');
const faceCtx = faceCv.getContext('2d');

game.on('customer', (c, what, deal) => {
  faceCtx.imageSmoothingEnabled = false;
  faceCtx.clearRect(0, 0, 64, 64);
  faceCtx.drawImage(customerSprite(c.face || 0), 0, 0, 64, 64);

  $('#cust-name').textContent = c.name;
  const price = game.prices[c.wants];
  const ledger = game.upgrades.includes('ledger') ? ` They would go to ${c.wtp}.` : '';
  $('#cust-line').textContent = `Wants ${c.qty}× ${ITEMS[c.wants].name}. You are asking ${price}.${ledger}`;

  const v = $('#cust-verdict');
  v.classList.remove('is-good', 'is-bad');
  show($('#haggle-row'), what === 'haggle');

  if (what === 'sold') {
    v.textContent = `Sold ${deal.qty} for ${deal.total} coin.`;
    v.classList.add('is-good');
  } else if (what === 'haggle') {
    v.textContent = `“I'll give you ${c.wtp} each, not a coin more.”`;
  } else {
    v.textContent = 'Walked out.';
    v.classList.add('is-bad');
  }

  $('#serve-tally').textContent =
    `Today: ${game.daySold} sold, ${game.dayTakings} coin, ${game.dayWalkouts} walked out. ${game.queue.length} still waiting.`;
});

$('#btn-accept').addEventListener('click', () => game.answerHaggle(true));
$('#btn-hold').addEventListener('click', () => game.answerHaggle(false));

/* ---------------------------------------------------------------- evening -- */

function renderEvening() {
  $('#evening-h').textContent = `Day ${game.day} — the day's takings`;
  const tally = $('#evening-tally');
  tally.textContent = '';
  const rows = [
    ['Sold', `${game.daySold} goods`],
    ["Today's takings", `${game.dayTakings} coin`],
    ['Walked out', `${game.dayWalkouts}`],
    ['Standing', reputationWord(game.rep)],
    ['In the purse', `${Math.round(game.gold)} coin`],
  ];
  const spoiledIds = Object.keys(game.spoiled || {}).filter((k) => game.spoiled[k]);
  if (spoiledIds.length) {
    rows.push(['Spoiled overnight', spoiledIds.map((k) => `${game.spoiled[k]}× ${ITEMS[k].name}`).join(', ')]);
  }
  for (const [k, v] of rows) {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = k;
    const b = document.createElement('b');
    b.textContent = v;
    li.append(s, b);
    tally.append(li);
  }

  const list = $('#upgrade-list');
  list.textContent = '';
  for (const u of UPGRADES) {
    const li = document.createElement('li');
    const owned = game.upgrades.includes(u.id);
    li.classList.toggle('is-owned', owned);
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = u.name;
    const sp = document.createElement('span');
    sp.textContent = u.blurb;
    nm.append(b, sp);
    li.append(nm);
    if (owned) {
      const c = document.createElement('span');
      c.className = 'cost';
      c.textContent = 'owned';
      li.append(c);
    } else {
      const c = document.createElement('span');
      c.className = 'cost';
      c.textContent = `${u.cost}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini';
      btn.textContent = '✓';
      btn.setAttribute('aria-label', `Buy ${u.name} for ${u.cost} coin`);
      btn.disabled = !game.affordable(u.id);
      btn.addEventListener('click', () => game.buyUpgrade(u.id));
      li.append(c, btn);
    }
    list.append(li);
  }

  const note = $('#rent-note');
  const dueToday = rentDue(game.day);
  const nextDay = Math.ceil((game.day + 1) / RENT_EVERY) * RENT_EVERY;
  if (dueToday) {
    note.textContent = `Rent of ${dueToday} coin falls tonight. You have ${Math.round(game.gold)}.`;
    note.classList.add('is-due');
  } else {
    note.textContent = `Rent of ${rentDue(nextDay)} coin falls on day ${nextDay}.`;
    note.classList.remove('is-due');
  }
}

function reputationWord(rep) {
  if (rep >= 70) return 'beloved';
  if (rep >= 35) return 'well liked';
  if (rep >= 10) return 'trusted';
  if (rep > -10) return 'unknown';
  if (rep > -30) return 'grumbled about';
  return 'avoided';
}

game.on('evening', renderEvening);

$('#btn-sleep').addEventListener('click', () => {
  sfx.ui();
  game.sleep();
});

game.on('save', () => store.set(SAVE_KEY, game.snapshot()));

/* ------------------------------------------------------------------- over -- */

let nameSaved = false;

game.on('gameover', (r) => {
  store.del(SAVE_KEY);
  const best = store.get(BEST_KEY, { score: 0, day: 0 });
  const isBest = r.score > best.score;
  if (isBest) store.set(BEST_KEY, { score: r.score, day: r.day });
  submitScore(r);
  nameSaved = false;
  $('#name-input').value = traderName.get();
  $('#btn-save-name').textContent = 'Save';

  $('#over-title').textContent = r.won ? 'You kept the shop' : isBest ? 'Best run yet' : 'Shop closed';
  $('#over-reason').textContent = r.reason;
  $('#over-score').textContent = r.score.toLocaleString('en-US');
  $('#over-days').textContent = `${r.day} of ${DAYS_TARGET}`;
  $('#over-sold').textContent = r.sold;
  $('#over-best').textContent = store.get(BEST_KEY, { score: 0 }).score.toLocaleString('en-US');
  showOnly('over');
});

$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});
$('#name-input').addEventListener('blur', saveName);

function saveName() {
  if (nameSaved) return;
  const clean = $('#name-input').value.toUpperCase().replace(/[^A-Z0-9 .\-_]/g, '').trim().slice(0, 12);
  if (!clean) return;
  traderName.set(clean);
  nameSaved = true;
  $('#btn-save-name').textContent = 'Saved';
  pushScore();
  sfx.ui();
  setTimeout(() => {
    $('#btn-save-name').textContent = 'Save';
  }, 1500);
}

/* ------------------------------------------------------------------ input -- */

/* Touch: drag anywhere on the wood to walk. A floating stick rather than a fixed
 * pad, because on a tall map your thumb ends up wherever the last gather was. */
let stickId = null;
let stickOrigin = null;

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'forage') return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  stickId = e.pointerId;
  stickOrigin = { x: e.clientX, y: e.clientY };
  unlock();
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId || !stickOrigin) return;
  const dx = e.clientX - stickOrigin.x;
  const dy = e.clientY - stickOrigin.y;
  const d = Math.hypot(dx, dy);
  const DEAD = 6;
  const MAX = 46;
  if (d < DEAD) {
    game.setStick(null);
    return;
  }
  const k = Math.min(1, (d - DEAD) / (MAX - DEAD)) / d;
  game.setStick({ x: dx * k, y: dy * k });
});

const dropStick = (e) => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  stickOrigin = null;
  game.setStick(null);
};
canvas.addEventListener('pointerup', dropStick);
canvas.addEventListener('pointercancel', dropStick);

const KEYMAP = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    togglePause();
    return;
  }
  const k = KEYMAP[e.key];
  if (!k) return;
  e.preventDefault();
  game.key(k, true);
  unlock();
});

window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key];
  if (k) game.key(k, false);
});

/* ------------------------------------------------------------------ pause -- */

let paused = false;

function togglePause() {
  if (game.phase !== 'forage' && !paused) return;
  paused = !paused;
  show(SCREENS.pause, paused);
  show(hudEl, !paused);
  if (paused) game.stop();
  else game.start();
  sfx.ui();
}

$('#btn-pause').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePause();
});
$('#btn-resume').addEventListener('click', () => togglePause());
$('#btn-quit').addEventListener('click', () => {
  paused = false;
  game.stop();
  store.del(SAVE_KEY);
  game.phase = 'menu';
  showOnly('menu');
  refreshMenu();
  game.start();
});

[$('#btn-sound'), $('#btn-sound-2')].forEach((b) =>
  b.addEventListener('click', () => {
    setSound(!soundOn());
    syncSoundButtons();
    sfx.ui();
  })
);

/* ------------------------------------------------------------------- boot -- */

$('#btn-start').addEventListener('click', () => {
  unlock();
  sfx.ui();
  store.del(SAVE_KEY);
  game.newRun();
});

$('#btn-again').addEventListener('click', () => {
  unlock();
  sfx.ui();
  game.newRun();
});

$('#btn-continue').addEventListener('click', () => {
  unlock();
  sfx.ui();
  const saved = store.get(SAVE_KEY, null);
  if (!saved || !game.restore(saved)) game.newRun();
});

function refreshMenu() {
  const best = store.get(BEST_KEY, { score: 0, day: 0 });
  $('#menu-best').textContent = best.score
    ? `Best: ${best.score.toLocaleString('en-US')} coin taken, day ${best.day}`
    : 'No shop yet';
  const saved = store.get(SAVE_KEY, null);
  show($('#btn-continue'), !!saved);
  if (saved) $('#btn-continue').textContent = `Continue — day ${saved.day}`;
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 80);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'forage' && !paused) togglePause();
});

/* The arcade game page's sound button reaches in here. */
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const msg = e.data;
  if (!msg || msg.type !== 'arcade:set-sound') return;
  setSound(!!msg.on);
  syncSoundButtons();
});

['pointerdown', 'keydown'].forEach((evt) =>
  window.addEventListener(evt, () => unlock(), { once: true, passive: true })
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

syncSoundButtons();
refreshMenu();
showOnly('menu');
game.resize();
game.start();
