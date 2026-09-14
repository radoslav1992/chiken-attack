import { attachArcade, isEditing, postScore } from '../../shared/arcade.js';
/* Whittle & Wares boot: input, the DOM half of the game, persistence, PWA. */

import {
  Game,
  ITEMS,
  RECIPES,
  UPGRADES,
  UPGRADE_BY_ID,
  rentDue,
  RENT_EVERY,
  suggestedPrice,
  priceOutlook,
  priceCeiling,
  priceLabel,
  stockCapacity,
  DAYS_TARGET,
} from './game.js';
import { orderSlots, orderFillable } from './economy.js';
import {
  seasonAt,
  eventAt,
  seasonGoals,
  BADGES,
  SPECIALISATIONS,
  specialisation,
} from './progression.js';
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
      if (k === SAVE_KEY) show($('#save-warning'), false);
      return true;
    } catch {
      if (k === SAVE_KEY) {
        $('#save-warning').textContent =
          'Saving is unavailable in this browser. Keep this tab open to keep your shop.';
        show($('#save-warning'), true);
      }
      return false;
    }
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
    result.id ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`);
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
  postScore(lastRun, traderName.get());
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
  if (!iconCache.has(id))
    iconCache.set(id, itemIcon(id, ITEMS[id].colour).toDataURL());
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

const objEl = $('#objective');
const objText = $('#obj-text');
const objHome = $('#obj-home');
const coachEl = $('#coach');
let lastCoach = null;

/* The forage strip: what to do, and how far the door is. Rebuilt on every HUD
 * tick but only written when the text actually changes, because this runs at
 * frame rate and setting textContent every frame is a layout thrash for nothing. */
function renderObjective() {
  const foraging = game.phase === 'forage';
  show(objEl, foraging);
  show(coachEl, foraging && !!game.coach());
  if (!foraging) return;

  const html = game.objective();
  if (objText.dataset.v !== html) {
    objText.dataset.v = html;
    // Only <b> is ever produced, by objective() itself — no user text reaches here.
    objText.innerHTML = html;
  }

  const home = game.homeInfo();
  const atDoor = home.paces <= 2;
  const label = '↩ Return to shop';
  if (objHome.textContent !== label) objHome.textContent = label;
  objEl.classList.toggle('is-home', atDoor);

  const tip = game.coach();
  if (tip !== lastCoach) {
    lastCoach = tip;
    if (tip) coachEl.innerHTML = tip;
  }
}

game.on('hud', () => {
  renderObjective();
  hudDay.textContent = `${seasonAt(game.day).name} · Day ${game.day}`;
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
  paused = false;
  if (phase === 'forage') {
    showOnly('forage');
    renderObjective();
    return;
  }
  show(objEl, false);
  show(coachEl, false);
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
    (reason ? `${reason} ` : '') +
    'Turn materials into goods worth more than their parts.' +
    (game.nextOrder()
      ? ` Commission: ${game.nextOrder().qty}× ${ITEMS[game.nextOrder().item].name} by day ${game.nextOrder().due}.`
      : '');
  const list = $('#craft-list');
  list.textContent = '';
  const book = game.recipeBook();
  for (const id of Object.keys(RECIPES)) {
    const known = book.includes(id);
    const li = document.createElement('li');
    li.classList.toggle('is-owned', !known);
    li.append(icon(id));
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = `${ITEMS[id].name} · ${ITEMS[id].value} coin`;
    const sp = document.createElement('span');
    sp.textContent = known
      ? Object.entries(RECIPES[id])
          .map(([k, v]) => `${v}x ${ITEMS[k].name} (have ${game.inv[k] || 0})`)
          .join(', ')
      : {
          chime: 'Guild Artisan I · after day 30',
          chest: 'Guild Artisan III · after day 30',
          clock: 'Guild Artisan V · after day 30',
        }[id] || 'Needs the Master Bench';
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
    if (known) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'mini batch';
      all.textContent = 'All';
      all.setAttribute('aria-label', `Craft all ${ITEMS[id].name}`);
      all.disabled = btn.disabled;
      all.addEventListener('click', () => {
        game.craft(id, 1000);
        renderCraft();
      });
      li.append(all);
    }
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
    `${reason ? reason + ' ' : ''}${game.event.name}: ${game.event.text} Wanted: ${hot}. Lower demand: ${ITEMS[m.cold].name}.`;

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
    const tag =
      m.mult[id] >= 1.4
        ? ' — wanted today'
        : m.mult[id] < 1
          ? ' — glutted'
          : '';
    sp.textContent = `going rate ${sug}${tag}`;
    if (tag) sp.className = m.mult[id] >= 1.4 ? 'hot' : 'cold';
    nm.append(b, sp);
    li.append(nm);

    /* The outlook bar. Three segments — will buy, will haggle, will walk — sized
     * from the same distribution the customers are drawn from. This is the
     * feedback the screen was missing: before it, the price was a number with two
     * arrows and no stated consequence, so raising it read exactly like lowering
     * it right up until the customers had already gone. */
    const outlook = document.createElement('div');
    outlook.className = 'outlook';
    const segBuy = document.createElement('i');
    segBuy.className = 'seg seg-buy';
    const segHag = document.createElement('i');
    segHag.className = 'seg seg-haggle';
    const segOut = document.createElement('i');
    segOut.className = 'seg seg-out';
    outlook.append(segBuy, segHag, segOut);
    const verdict = document.createElement('span');
    verdict.className = 'verdict';
    nm.append(outlook, verdict);

    const dec = document.createElement('button');
    dec.type = 'button';
    dec.className = 'mini';
    dec.textContent = '−';
    dec.setAttribute('aria-label', `Lower the price of ${ITEMS[id].name}`);
    const val = document.createElement('span');
    val.className = 'price';
    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'mini';
    inc.textContent = '+';
    inc.setAttribute('aria-label', `Raise the price of ${ITEMS[id].name}`);

    const ceiling = priceCeiling(id, m);
    const paint = () => {
      const price = game.prices[id];
      val.textContent = price;
      const o = priceOutlook(id, price, m, game.rep);
      const lab = priceLabel(o);
      segBuy.style.setProperty('--w', `${(o.buy * 100).toFixed(1)}%`);
      segHag.style.setProperty('--w', `${(o.haggle * 100).toFixed(1)}%`);
      segOut.style.setProperty('--w', `${(o.leave * 100).toFixed(1)}%`);
      verdict.textContent = lab.text;
      verdict.dataset.tone = lab.tone;
      dec.disabled = price <= 1;
      inc.disabled = price >= ceiling;
    };

    const step = Math.max(1, Math.round(sug * 0.1));
    dec.addEventListener('click', () => {
      game.setPrice(id, game.prices[id] - step);
      paint();
      sfx.ui();
    });
    inc.addEventListener('click', () => {
      game.setPrice(id, game.prices[id] + step);
      paint();
      sfx.ui();
    });
    paint();
    li.append(dec, val, inc);
    list.append(li);
  }

  const cap = stockCapacity(game.upgrades);
  let held = 0;
  for (const k in game.inv) held += game.inv[k];
  const backroom = held
    ? `${held} in the back (including commission supplies). The shelves hold ${cap}. `
    : '';
  $('#shop-note').textContent =
    `${backroom}Green is buyers, amber hagglers, red walkouts. Open up and the day's customers come in one at a time.`;
}

document.querySelectorAll('[data-pricing]').forEach((btn) =>
  btn.addEventListener('click', () => {
    for (const id of game.onShelf())
      game.setPrice(
        id,
        suggestedPrice(id, game.market) * Number(btn.dataset.pricing),
      );
    renderShop();
  }),
);

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
  const ledger = game.upgrades.includes('ledger')
    ? ` They would go to ${c.wtp}.`
    : '';
  $('#cust-line').textContent =
    `Wants ${c.qty}× ${ITEMS[c.wants].name}. You are asking ${price}.${ledger}`;

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

$('#btn-speed').addEventListener('click', () => {
  game.fastServe = !game.fastServe;
  $('#btn-speed').textContent =
    `Serving speed: ${game.fastServe ? 'quick' : 'normal'}`;
  $('#btn-speed').setAttribute('aria-pressed', String(game.fastServe));
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
    ['Commissions filled', `${game.ordersDone}`],
    ['Standing', reputationWord(game.rep)],
    ['In the purse', `${Math.round(game.gold)} coin`],
  ];
  const spoiledIds = Object.keys(game.spoiled || {}).filter(
    (k) => game.spoiled[k],
  );
  if (spoiledIds.length) {
    rows.push([
      'Spoiled overnight',
      spoiledIds.map((k) => `${game.spoiled[k]}× ${ITEMS[k].name}`).join(', '),
    ]);
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

  renderOrders();
  renderJournal($('#evening-journal'));
  renderGuild();

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

function renderJournal(container) {
  container.textContent = '';
  const season = seasonAt(game.day),
    p = game.progress;
  const title = document.createElement('h3');
  title.className = 'journal-heading';
  title.textContent = `${season.name} · Year ${season.year}`;
  const sub = document.createElement('p');
  sub.className = 'panel-note';
  sub.textContent = `${season.subtitle} · ${season.left} days left · ${p.stamps} guild stamps`;
  const event = document.createElement('p');
  event.className = 'journal-event';
  event.textContent = `${game.event.name} — ${game.event.text}`;
  const demand = document.createElement('p');
  demand.className = 'panel-note';
  demand.textContent = `Season favourites (+18%): ${season.goods.map((id) => ITEMS[id].name).join(', ')}.`;
  container.append(title, sub, event, demand);
  const list = document.createElement('ul');
  list.className = 'goal-list';
  for (const goal of seasonGoals(p)) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${goal.done ? '✓ ' : ''}${goal.name}`;
    const value = document.createElement('b');
    value.textContent = `${goal.value}/${goal.target}`;
    const bar = document.createElement('progress');
    bar.max = goal.target;
    bar.value = goal.value;
    bar.setAttribute('aria-label', goal.name);
    const reward = document.createElement('small');
    reward.textContent = goal.done
      ? 'Reward collected'
      : `+${goal.reward} coin · +1 stamp`;
    li.append(label, value, bar, reward);
    list.append(li);
  }
  container.append(list);
  for (const text of game.progressNews || []) {
    const news = document.createElement('p');
    news.className = 'journal-news';
    news.textContent = text;
    container.append(news);
  }
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `Maker’s collection · ${Object.keys(p.made).length}/8 recipes · ${p.badges.length}/${BADGES.length} badges`;
  details.append(summary);
  for (const badge of BADGES) {
    const line = document.createElement('p');
    line.className = 'collection-line';
    line.textContent = `${p.badges.includes(badge.id) ? '★' : '☆'} ${badge.name} — ${badge.text} (${Math.min(badge.target, badge.goal(p))}/${badge.target})`;
    details.append(line);
  }
  const collection = document.createElement('div');
  collection.className = 'collection-grid';
  for (const id of Object.keys(RECIPES)) {
    const tile = document.createElement('div');
    tile.className = p.made[id] ? 'collected' : 'uncollected';
    const text = document.createElement('span');
    text.textContent = `${ITEMS[id].name} · ${p.made[id] || 0} made`;
    tile.append(icon(id), text);
    collection.append(tile);
  }
  details.append(collection);
  container.append(details);
}

function renderGuild() {
  const list = $('#guild-list');
  list.textContent = '';
  for (const spec of SPECIALISATIONS) {
    const next = specialisation(game.upgrades, spec.id);
    const li = document.createElement('li');
    const nm = document.createElement('div');
    nm.className = 'nm';
    const name = document.createElement('b');
    name.textContent = `${spec.name} · ${next.level}/5`;
    const desc = document.createElement('span');
    desc.textContent = spec.text;
    nm.append(name, desc);
    li.append(nm);
    const btn = document.createElement('button');
    btn.className = 'mini guild-buy';
    btn.type = 'button';
    btn.textContent = next.max
      ? 'Mastered'
      : `${next.gold}c · ${next.stamps} stamps`;
    btn.setAttribute('aria-label', `Upgrade ${spec.name}: ${btn.textContent}`);
    btn.disabled =
      next.max ||
      game.day <= DAYS_TARGET ||
      game.gold - rentDue(game.day) < next.gold ||
      game.progress.stamps < next.stamps;
    btn.addEventListener('click', () => game.buySpecialisation(spec.id));
    li.append(btn);
    list.append(li);
  }
}

/* Commissions: what settled on the way in, what is still owed, and the one on
 * the table for tomorrow. */
function renderOrders() {
  const list = $('#order-list');
  list.textContent = '';

  for (const news of game.orderNews || []) {
    const li = document.createElement('li');
    li.className = news.ok ? 'order-news is-good' : 'order-news is-bad';
    li.textContent = news.text;
    list.append(li);
  }

  for (const o of game.orders) {
    const have = game.inv[o.item] || 0;
    const li = document.createElement('li');
    li.className = 'order';
    li.append(icon(o.item));
    const nm = document.createElement('div');
    nm.className = 'nm';
    const b = document.createElement('b');
    b.textContent = `${o.qty}× ${ITEMS[o.item].name} for ${o.from}`;
    const sp = document.createElement('span');
    const left = o.due - game.day;
    sp.textContent = `${Math.min(have, o.qty)}/${o.qty} gathered · ${
      left < 0
        ? 'overdue'
        : left === 0
          ? 'deadline passed tonight'
          : `${left} day${left > 1 ? 's' : ''} left`
    } · pays ${o.pay}`;
    if (left <= 0) sp.className = 'cold';
    nm.append(b, sp);
    li.append(nm);
    if (orderFillable(o, game.inv)) {
      const tick = document.createElement('span');
      tick.className = 'cost';
      tick.textContent = 'ready';
      li.append(tick);
    }
    list.append(li);
  }

  if (!game.orders.length && !(game.orderNews || []).length) {
    const li = document.createElement('li');
    li.className = 'order-news';
    li.textContent = `Nothing owed. You may hold ${orderSlots(game.rep)} at a time.`;
    list.append(li);
  }

  const offer = game.offer;
  show($('#offer'), !!offer);
  if (offer) {
    const market = ITEMS[offer.item].value * offer.qty;
    $('#offer-line').textContent =
      `${offer.from} wants ${offer.qty}× ${ITEMS[offer.item].name} by day ${offer.due}, and will pay ${offer.pay} coin — about ${Math.round((offer.pay / market) * 100 - 100)}% over the market.`;
  }
}

$('#btn-accept-order').addEventListener('click', () => game.takeOffer(true));
$('#btn-decline').addEventListener('click', () => game.takeOffer(false));

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

function saveGame() {
  if (
    ['forage', 'craft', 'shop', 'serving', 'evening'].includes(game.phase) ||
    (game.phase === 'over' && game.won)
  )
    return store.set(SAVE_KEY, game.snapshot());
}
game.on('save', saveGame);
setInterval(() => {
  if (game.phase === 'forage' && !paused) saveGame();
}, 3000);
window.addEventListener('pagehide', saveGame);

/* ------------------------------------------------------------------- over -- */

let nameSaved = false;

game.on('gameover', (r) => {
  if (!r.canContinue) store.del(SAVE_KEY);
  const best = store.get(BEST_KEY, { score: 0, day: 0 });
  const isBest = r.score > best.score;
  if (isBest) store.set(BEST_KEY, { score: r.score, day: r.day });
  submitScore(r);
  nameSaved = false;
  $('#name-input').value = traderName.get();
  $('#btn-save-name').textContent = 'Save';

  $('#over-title').textContent = r.won
    ? 'You kept the shop'
    : isBest
      ? 'Best run yet'
      : 'Shop closed';
  $('#over-reason').textContent = r.reason;
  $('#over-score').textContent = r.score.toLocaleString('en-US');
  $('#over-days').textContent = r.shopDay || r.day;
  $('#over-total').textContent = (r.total ?? r.score).toLocaleString('en-US');
  show($('#btn-career'), !!r.canContinue);
  $('#over-sold').textContent = r.sold;
  $('#over-best').textContent = store
    .get(BEST_KEY, { score: 0 })
    .score.toLocaleString('en-US');
  showOnly('over');
});

$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveName();
});
$('#name-input').addEventListener('blur', saveName);

function saveName() {
  if (nameSaved) return;
  const clean = $('#name-input')
    .value.toUpperCase()
    .replace(/[^A-Z0-9 .\-_]/g, '')
    .trim()
    .slice(0, 12);
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
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
};

window.addEventListener('keydown', (e) => {
  if (isEditing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.repeat && ['p', 'P', 'Escape', 'h', 'H'].includes(e.key)) return;
  if (['h', 'H'].includes(e.key) && game.phase === 'forage' && !paused) {
    game.goHome('You head home to the workbench.');
    return;
  }
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
  if (paused) {
    renderJournal($('#pause-journal'));
    saveGame();
    for (const key of ['left', 'right', 'up', 'down']) game.key(key, false);
    game.setStick(null);
    stickId = null;
    stickOrigin = null;
    game.stop();
  } else game.start();
  sfx.ui();
}

$('#btn-pause').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePause();
});
$('#btn-journal').addEventListener('click', () => togglePause());
$('#obj-home').addEventListener('click', () => {
  if (!paused) game.goHome('You head home to the workbench.');
});
$('#btn-career').addEventListener('click', () => game.continueShop());
$('#btn-resume').addEventListener('click', () => togglePause());
$('#btn-quit').addEventListener('click', () => {
  paused = false;
  game.stop();
  if (saveGame() === false) {
    paused = true;
    return;
  }
  show(objEl, false);
  show(coachEl, false);
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
  }),
);

/* ------------------------------------------------------------------- boot -- */

$('#btn-start').addEventListener('click', () => {
  unlock();
  sfx.ui();
  if (store.get(SAVE_KEY, null) && $('#btn-start').dataset.confirm !== 'yes') {
    $('#btn-start').dataset.confirm = 'yes';
    $('#btn-start').textContent = 'Replace saved shop?';
    return;
  }
  delete $('#btn-start').dataset.confirm;
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
  if (!saved || !game.restore(saved)) {
    $('#menu-best').textContent =
      'This save could not be read. Your saved data is still here; you can choose to open a new shop.';
  }
});

function refreshMenu() {
  // Nothing else on the menu said what a day consists of.

  const best = store.get(BEST_KEY, { score: 0, day: 0 });
  $('#menu-best').textContent = best.score
    ? `Best: ${best.score.toLocaleString('en-US')} coin taken, day ${best.day}`
    : 'No shop yet';
  const saved = store.get(SAVE_KEY, null);
  show($('#btn-continue'), !!saved);
  delete $('#btn-start').dataset.confirm;
  $('#btn-start').textContent = saved ? 'Start a new shop' : 'Open the shop';
  if (saved) $('#btn-continue').textContent = `Continue — day ${saved.day}`;
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => game.resize(), 80);
});

window.addEventListener('blur', () => {
  if (game.phase === 'forage' && !paused) togglePause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    if (game.phase === 'forage' && !paused) togglePause();
  }
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
  window.addEventListener(evt, () => unlock(), { once: true, passive: true }),
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

attachArcade(game, {
  slug: 'whittle-wares',
  title: 'Whittle & Wares',
  resultSelector: '#screen-over .panel',
  mode: (r) => r.difficulty?.id || 'veteran',
});
if (window.parent !== window) document.body.dataset.embedded = '';
