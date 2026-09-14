import { Game, wavePlan, validSave } from './engine.js';
import { Renderer, canvasPoint, nearestPad } from './render.js';
import {
  MAPS,
  TOWERS,
  CAPTAINS,
  ENEMIES,
  PERKS,
  dailyConfig,
  challengeConfig,
  challengeUrl,
  utcDay,
} from './data.js';
import { isEditing, postScore, shareLink } from '../../shared/arcade.js';
import { sound, unlock, soundOn, setSound } from './audio.js';

const $ = (selector) => document.querySelector(selector),
  show = (element, on) => element.classList.toggle('hidden', !on);
const game = new Game(),
  renderer = new Renderer($('#game'));
const SAVE = 'dam-defender.save',
  PROFILE = 'dam-defender.profile';
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === SAVE) $('#save-status').textContent = '';
    return true;
  } catch {
    $('#save-status').textContent =
      'Saving is unavailable in this browser. Keep this tab open to keep your defence.';
    return false;
  }
}
function save() {
  if (game.state) return write(SAVE, game.snapshot());
  return true;
}
const stored = read(PROFILE, {}),
  profile = {
    wins: Array.isArray(stored?.wins)
      ? [
          ...new Set(
            stored.wins.filter((n) => Number.isInteger(n) && n >= 0 && n < 3),
          ),
        ]
      : [],
    best: stored?.best && typeof stored.best === 'object' ? stored.best : {},
    daily:
      stored?.daily && typeof stored.daily === 'object' ? stored.daily : {},
  };
const invitation = challengeConfig(location.search);
const targetScore = (() => {
  const v = new URLSearchParams(location.search).get('challenge');
  return /^\d{1,9}$/.test(v || '') ? Math.min(100000000, Number(v)) : 0;
})();
let selectedMap = 0,
  selectedPad = -1,
  selectedTower = 'acorn',
  fast = false,
  pendingConfig = null,
  lastResult = null,
  visible = 'menu',
  lastFrame = 0,
  lastHud = 0;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialog = $('#dialog');
function text(selector, value) {
  const el = $(selector);
  if (el.textContent !== String(value)) el.textContent = String(value);
}
function button(label, kind, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = kind;
  b.textContent = label;
  b.addEventListener('click', fn);
  return b;
}

function mapPreview(map) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 96 60');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(svg.namespaceURI, 'rect');
  bg.setAttribute('width', '96');
  bg.setAttribute('height', '60');
  bg.setAttribute('rx', '8');
  bg.setAttribute('fill', map.land);
  svg.append(bg);
  const river = document.createElementNS(svg.namespaceURI, 'path');
  river.setAttribute(
    'd',
    map.river
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x / 10},${y / 10}`)
      .join(' '),
  );
  river.setAttribute('fill', 'none');
  river.setAttribute('stroke', map.water);
  river.setAttribute('stroke-width', '12');
  svg.append(river);
  return svg;
}
function renderMenu() {
  const list = $('#map-list');
  list.textContent = '';
  for (const [i, map] of MAPS.entries()) {
    const open =
      i === 0 || profile.wins.includes(i - 1) || profile.wins.includes(i);
    const b = button('', 'map-card', () => {
      selectedMap = i;
      renderMenu();
    });
    b.disabled = !open;
    b.setAttribute('aria-pressed', String(selectedMap === i));
    b.setAttribute(
      'aria-label',
      `${map.name}${open ? '' : ', win the previous river to unlock'}`,
    );
    const label = document.createElement('span'),
      name = document.createElement('strong'),
      sub = document.createElement('small');
    name.textContent = map.name;
    sub.textContent = open
      ? map.difficulty
      : `Protect ${MAPS[i - 1].name} to unlock`;
    label.append(name, sub);
    const mark = document.createElement('span');
    mark.className = 'marker';
    mark.textContent = profile.wins.includes(i) ? '✓' : open ? '→' : '○';
    b.append(mapPreview(map), label, mark);
    list.append(b);
  }
  const current = $('#captain').value || 'moss';
  $('#captain').textContent = '';
  for (const c of CAPTAINS) {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = `${c.name} — ${c.title}${profile.wins.length < c.unlock ? ' (locked)' : ''}`;
    option.disabled = profile.wins.length < c.unlock;
    $('#captain').append(option);
  }
  $('#captain').value = CAPTAINS.some(
    (c) => c.id === current && c.unlock <= profile.wins.length,
  )
    ? current
    : 'moss';
  renderCaptain();
  text('#completion', `${new Set(profile.wins).size} / 3 protected`);
  text('#start', `Defend ${MAPS[selectedMap].name} →`);
  const saved = read(SAVE, null);
  show($('#continue'), !!saved);
  text(
    '#continue',
    saved && validSave(saved)
      ? `${['over', 'victory'].includes(saved.phase) ? 'View result' : 'Continue'} · ${MAPS[saved.map].name} · wave ${saved.wave}`
      : 'Check saved defence',
  );
  const daily = dailyConfig();
  text('#daily-title', MAPS[daily.map].name);
  text(
    '#daily-note',
    `${daily.daily} · Same river and captain for everyone.${profile.daily[daily.daily] ? ` Your best: ${Number(profile.daily[daily.daily]).toLocaleString()}.` : ''}`,
  );
  show($('#invitation'), !!invitation);
  if (invitation)
    text(
      '#invitation',
      `${invitation.daily ? 'Replay ' + invitation.daily : 'Play your friend’s river'}${targetScore ? ' · beat ' + targetScore.toLocaleString() : ''} →`,
    );
}
function renderCaptain() {
  text(
    '#captain-note',
    CAPTAINS.find((c) => c.id === $('#captain').value)?.description || '',
  );
}
function openDialog(kind, title, note, eyebrow) {
  for (const id of ['pause', 'draft', 'result', 'replace'])
    show($(`#${id}-content`), id === kind);
  text('#dialog-title', title);
  text('#dialog-note', note || '');
  text('#dialog-eyebrow', eyebrow || 'THE WOODLAND LEDGER');
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  if (dialog.open) dialog.close();
}
function begin(config) {
  closeDialog();
  selectedPad = 0;
  selectedTower = 'acorn';
  visible = 'run';
  show($('#menu-screen'), false);
  show($('#run-screen'), true);
  lastResult = null;
  game.newRun({
    ...config,
    id:
      globalThis.crypto?.randomUUID?.() ||
      `dam-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  });
  renderRun();
  renderer.draw(game, selectedPad, 0, reduced);
  $('#game').scrollIntoView({ block: 'nearest' });
}
function requestRun(config) {
  unlock();
  const s = read(SAVE, null);
  if (s && !['over', 'victory'].includes(s.phase)) {
    pendingConfig = config;
    openDialog(
      'replace',
      'A new expedition?',
      'Your existing defence is still saved.',
      'ONE SAVED DEFENCE',
    );
  } else begin(config);
}
$('#start').addEventListener('click', () =>
  requestRun({
    map: selectedMap,
    captain: $('#captain').value,
    seed: Math.floor(Math.random() * 4294967296),
  }),
);
$('#daily').addEventListener('click', () => requestRun(dailyConfig()));
$('#invitation').addEventListener(
  'click',
  () => invitation && requestRun(invitation),
);
$('#captain').addEventListener('change', renderCaptain);
$('#replace').addEventListener('click', () => {
  if (pendingConfig) {
    const config = pendingConfig;
    pendingConfig = null;
    begin(config);
  }
});
$('#keep-save').addEventListener('click', () => {
  pendingConfig = null;
  closeDialog();
});
$('#continue').addEventListener('click', () => {
  unlock();
  const s = read(SAVE, null);
  if (!validSave(s)) {
    text(
      '#menu-message',
      'This save could not be read. It has been kept; starting a new expedition will replace it.',
    );
    return;
  }
  visible = 'run';
  show($('#menu-screen'), false);
  show($('#run-screen'), true);
  selectedPad = 0;
  game.restore(s);
  if (['over', 'victory'].includes(s.phase)) {
    handleResult({ won: s.phase === 'victory' });
    renderRun();
  } else {
    game.pause(true);
    renderRun();
  }
});

function renderPads() {
  const list = $('#pads');
  list.textContent = '';
  for (let i = 0; i < MAPS[game.state.map].pads.length; i++) {
    const tower = game.state.towers.find((t) => t.pad === i),
      b = button(String(i + 1), '', () => {
        selectedPad = i;
        renderPads();
        renderBuild();
      });
    b.setAttribute(
      'aria-label',
      `Clearing ${i + 1}${tower ? ': ' + TOWERS[tower.type].name + ', level ' + tower.level : ': empty'}`,
    );
    b.setAttribute('aria-pressed', String(i === selectedPad));
    b.classList.toggle('occupied', !!tower);
    list.append(b);
  }
}
function renderBuild() {
  const s = game.state;
  if (!s) return;
  const t = s.towers.find((t) => t.pad === selectedPad),
    list = $('#tower-list'),
    actions = $('#site-actions');
  list.textContent = '';
  actions.textContent = '';
  text(
    '#site-title',
    selectedPad < 0 ? 'Choose a clearing' : `Clearing ${selectedPad + 1}`,
  );
  text('#site-number', t ? `LEVEL ${t.level}` : '+ BUILD');
  const building = s.phase === 'build' && !s.paused;
  if (!t) {
    for (const [id, def] of Object.entries(TOWERS)) {
      const b = button('', 'tower-option', () => {
        selectedTower = id;
        renderBuild();
      });
      b.setAttribute('aria-pressed', String(selectedTower === id));
      b.setAttribute('aria-label', `${def.name}, ${game.buildCost(id)} wood`);
      const icon = document.createElement('span');
      icon.className = 'tower-icon';
      icon.textContent = def.icon;
      const label = document.createElement('span'),
        name = document.createElement('strong'),
        sub = document.createElement('small');
      name.textContent = def.name;
      sub.textContent =
        id === 'mill'
          ? 'Income & water'
          : id === 'watch'
            ? 'Long range · piercing'
            : id === 'bramble'
              ? 'Ground · slows'
              : id === 'log'
                ? 'Ground · splash'
                : 'Ground & air';
      label.append(name, sub);
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = game.buildCost(id);
      b.append(icon, label, price);
      list.append(b);
    }
    text('#tower-detail', TOWERS[selectedTower].description);
    const build = button(
      `Build ${TOWERS[selectedTower].name} · ${game.buildCost(selectedTower)} wood`,
      'primary full',
      () => {
        if (game.build(selectedPad, selectedTower)) sound('build');
      },
    );
    build.disabled =
      !building || selectedPad < 0 || s.wood < game.buildCost(selectedTower);
    actions.append(build);
  } else {
    const stats = game.stats(t);
    text(
      '#tower-detail',
      `${TOWERS[t.type].name} · ${TOWERS[t.type].description}${t.type !== 'mill' ? ` Damage ${Math.round(stats.damage)} · Range ${Math.round(stats.range)}.` : ''}`,
    );
    const art = document.createElement('div');
    art.className = 'owned-tower';
    art.textContent = `${TOWERS[t.type].icon} ${TOWERS[t.type].name}`;
    list.append(art);
    if (t.level < 3) {
      const cost = game.upgradeCost(t);
      for (const branch of t.level === 1 ? [null] : ['power', 'reach']) {
        const name = !branch
          ? 'Upgrade to level 2'
          : branch === 'power'
            ? t.type === 'mill'
              ? 'Profit mill · +50% income'
              : 'Power branch · +55% damage'
            : t.type === 'mill'
              ? 'Reservoir mill · 2× refill'
              : 'Reach branch · range & speed';
        const b = button(`${name} · ${cost} wood`, 'primary full', () => {
          if (game.upgrade(selectedPad, branch)) sound('build');
        });
        b.disabled = !building || s.wood < cost;
        actions.append(b);
      }
    } else {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = `Fully grown · ${t.branch === 'power' ? 'Power' : 'Reach'} branch`;
      actions.append(note);
    }
    const sell = button(
      `Salvage · recover ${Math.floor(t.spent * 0.7)} wood`,
      'secondary full',
      () => game.sell(selectedPad),
    );
    sell.disabled = !building;
    actions.append(sell);
  }
  const plan = wavePlan(s.seed, s.map, s.wave + 1);
  const types = [...new Set(plan.map((e) => ENEMIES[e.type].name))];
  text(
    '#forecast',
    s.phase === 'battle'
      ? `${s.queue.length + s.enemies.length} raiders remaining. Build and upgrade between waves.`
      : `Next: ${types.join(', ')}.${(s.wave + 1) % 6 === 0 ? ' Boss: ' + MAPS[s.map].boss + '.' : ''}`,
  );
  text('#next-wave', `Send wave ${s.wave + 1} →`);
  $('#next-wave').disabled =
    !building || !s.towers.some((t) => t.type !== 'mill');
  $('#repair').disabled = !building || s.wood < 40 || s.hp >= s.maxHp;
  updateHud();
}
function renderDraft() {
  const list = $('#perks');
  list.textContent = '';
  for (const id of game.state.choices) {
    const perk = PERKS.find((p) => p.id === id),
      b = button('', 'perk', () => {
        if (game.choose(id)) {
          sound('choose');
          closeDialog();
          renderRun();
        }
      }),
      title = document.createElement('strong'),
      desc = document.createElement('span');
    title.textContent = perk.name;
    desc.textContent = perk.text;
    b.append(title, desc);
    list.append(b);
  }
  openDialog(
    'draft',
    'A gift from the woodland.',
    'Choose one. These perks last for the rest of this expedition.',
    'WAVE ' + game.state.wave + ' COMPLETE',
  );
}
function renderRun() {
  const s = game.state;
  if (!s || visible !== 'run') return;
  text(
    '#run-label',
    `${MAPS[s.map].name} · Captain ${CAPTAINS.find((c) => c.id === s.captain).name}${s.daily ? ' · Daily ' + s.daily : ''}${s.endless ? ' · Endless' : ''}`,
  );
  text(
    '#phase-title',
    s.phase === 'battle'
      ? 'Hold the river.'
      : s.phase === 'build'
        ? 'A moment to build.'
        : s.phase === 'victory'
          ? 'The village is safe.'
          : s.phase === 'draft'
            ? 'Choose your advantage.'
            : 'A river worth defending.',
  );
  text(
    '#wave-tag',
    s.phase === 'build'
      ? `PREPARE · WAVE ${s.wave + 1}`
      : `WAVE ${s.wave}${s.endless ? ' · ENDLESS' : ' / 12'}`,
  );
  text('#message', s.message);
  renderPads();
  renderBuild();
  if (s.paused)
    openDialog(
      'pause',
      'River on pause.',
      'Your towers, enemies and resources are saved right where you left them.',
    );
  else if (s.phase === 'draft') renderDraft();
  else if (['victory', 'over'].includes(s.phase)) renderResult();
  else closeDialog();
}
function updateHud() {
  const s = game.state;
  if (!s) return;
  text('#hp', `${Math.ceil(s.hp)} / ${s.maxHp}`);
  text('#water', `${Math.floor(s.water)} / ${s.maxWater}`);
  text('#wood', Math.floor(s.wood).toLocaleString());
  text('#score', Math.floor(s.score).toLocaleString());
  $('#hp-meter').max = s.maxHp;
  $('#hp-meter').value = s.hp;
  $('#water-meter').max = s.maxWater;
  $('#water-meter').value = s.water;
  $('.hud').classList.toggle('low-water', s.water < 25);
  $('#flood').disabled =
    s.phase !== 'battle' || s.paused || s.water < 40 || s.floodCooldown > 0;
  text(
    '#flood',
    s.floodCooldown > 0
      ? `Gates resetting · ${Math.ceil(s.floodCooldown)}s`
      : 'Open floodgates · 40 water',
  );
  text(
    '#water-note',
    s.water < 25
      ? 'Low water: the dam takes 50% more damage.'
      : 'Keep 25 water in reserve to protect your dam.',
  );
  if (s.phase === 'battle')
    text(
      '#forecast',
      `${s.queue.length + s.enemies.length} raiders remaining. Build and upgrade between waves.`,
    );
}
$('#game').addEventListener('click', (event) => {
  if (!game.state || game.state.paused) return;
  const pad = nearestPad(
    game.state.map,
    canvasPoint(
      $('#game').getBoundingClientRect(),
      event.clientX,
      event.clientY,
    ),
  );
  if (pad >= 0) {
    selectedPad = pad;
    renderPads();
    renderBuild();
  }
});
$('#next-wave').addEventListener('click', () => {
  unlock();
  game.startWave();
});
$('#flood').addEventListener('click', () => {
  unlock();
  game.flood();
});
$('#repair').addEventListener('click', () => {
  if (game.repair()) sound('build');
});
$('#pause').addEventListener('click', () => game.pause());
$('#resume').addEventListener('click', () => {
  unlock();
  game.pause(false);
});
$('#speed').addEventListener('click', () => {
  fast = !fast;
  text('#speed', fast ? '2× speed' : '1× speed');
  $('#speed').setAttribute('aria-pressed', String(fast));
});
function backToMenu() {
  if (save() === false) return;
  visible = 'menu';
  if (game.state) game.state.paused = true;
  closeDialog();
  show($('#run-screen'), false);
  show($('#menu-screen'), true);
  renderMenu();
}
$('#menu').addEventListener('click', backToMenu);
$('#result-menu').addEventListener('click', backToMenu);
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (pendingConfig) {
    pendingConfig = null;
    closeDialog();
  } else if (game.state?.paused) game.pause(false);
});

function handleResult(result) {
  const s = game.state;
  lastResult = {
    id: s.id,
    game: 'dam-defender',
    score: Math.floor(s.score),
    wave: s.wave,
    difficulty: 'veteran',
  };
  const won = result.won ?? s.phase === 'victory';
  if (won && !profile.wins.includes(s.map)) profile.wins.push(s.map);
  profile.best[s.map] = Math.max(Number(profile.best[s.map]) || 0, s.score);
  if (s.daily) {
    profile.daily[s.daily] = Math.max(
      Number(profile.daily[s.daily]) || 0,
      s.score,
    );
    profile.daily = Object.fromEntries(
      Object.entries(profile.daily)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 60),
    );
  }
  write(PROFILE, profile);
  const records = read('beaver-games.records', {});
  if (records && typeof records === 'object' && !Array.isArray(records)) {
    records['dam-defender'] = {
      score: Math.max(Number(records['dam-defender']?.score) || 0, s.score),
      playedAt: Date.now(),
    };
    write('beaver-games.records', records);
  }
  window.parent.postMessage(
    {
      type: 'arcade:result',
      slug: 'dam-defender',
      score: Math.floor(s.score),
      mode: 'veteran',
      challengeUrl: challengeUrl(s, location.origin),
    },
    location.origin,
  );
  $('#name-input').value = read('dam-defender.name', 'BEAVER');
  if (s.score > 0) postScore(lastResult, $('#name-input').value);
  sound(won ? 'win' : 'lose');
}
function renderResult() {
  const s = game.state,
    won = s.phase === 'victory';
  const stats = $('#result-stats');
  stats.textContent = '';
  for (const [label, value] of [
    ['SCORE', s.score.toLocaleString()],
    ['WAVES', s.wave],
    ['FLOODS', s.floods],
  ]) {
    const cell = document.createElement('div'),
      v = document.createElement('strong'),
      l = document.createElement('span');
    v.textContent = value;
    l.textContent = label;
    cell.append(v, l);
    stats.append(cell);
  }
  const unlocks = won
    ? [
        s.map < 2
          ? `${MAPS[s.map + 1].name} is ready to explore.`
          : 'All three rivers explored.',
        profile.wins.length === 1
          ? 'Captain Pip joins your crew.'
          : profile.wins.length === 2
            ? 'Captain Fern joins your crew.'
            : '',
      ]
    : [];
  const sameChallenge =
    invitation &&
    invitation.seed === s.seed &&
    invitation.map === s.map &&
    invitation.captain === s.captain;
  text(
    '#unlock-note',
    sameChallenge && targetScore
      ? `${s.score > targetScore ? 'Rival beaten!' : s.score === targetScore ? 'A tie!' : `${(targetScore - s.score).toLocaleString()} points from your rival.`} ${unlocks.join(' ')}`
      : unlocks.join(' '),
  );
  show($('#endless'), won);
  openDialog(
    'result',
    won ? 'Small paws. Big victory.' : 'The river wins this round.',
    s.message,
    won ? 'RIVER PROTECTED' : 'ONE MORE GOOD IDEA',
  );
}
$('#endless').addEventListener('click', () => {
  lastResult = null;
  closeDialog();
  game.continueEndless();
});
$('#replay').addEventListener('click', () => {
  const s = game.state;
  begin({ seed: s.seed, map: s.map, captain: s.captain, daily: s.daily });
});
$('#share').addEventListener('click', () => {
  const s = game.state;
  shareLink(
    {
      title: 'Dam Defender · Beaver Games',
      text: `I held ${MAPS[s.map].name} for ${s.wave} waves and scored ${s.score.toLocaleString()}. Same river. Your turn.`,
      url: challengeUrl(s, location.origin),
    },
    $('#share-status'),
  );
});
$('#name-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name =
    $('#name-input')
      .value.toUpperCase()
      .replace(/[^A-Z0-9 .\-_]/g, '')
      .trim()
      .slice(0, 12) || 'BEAVER';
  $('#name-input').value = name;
  write('dam-defender.name', name);
  if (lastResult) postScore(lastResult, name);
});

function syncSound() {
  text('#sound', soundOn() ? 'Sound on ♪' : 'Sound off');
  $('#sound').setAttribute('aria-pressed', String(soundOn()));
}
$('#sound').addEventListener('click', () => {
  unlock();
  setSound(!soundOn());
  syncSound();
});
window.addEventListener('message', (event) => {
  if (
    event.origin === location.origin &&
    event.data?.type === 'arcade:set-sound'
  ) {
    setSound(!!event.data.on);
    syncSound();
  }
});
window.addEventListener('keydown', (event) => {
  if (
    isEditing(event.target) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat
  )
    return;
  if (visible !== 'run' || !game.state) return;
  const key = event.key.toLowerCase();
  if (key === 'p' || key === 'escape') {
    if (pendingConfig) return;
    event.preventDefault();
    game.pause();
    return;
  }
  if (dialog.open) return;
  if (event.target.closest('button') && (key === 'enter' || key === ' '))
    return;
  if (key === 'f') {
    event.preventDefault();
    unlock();
    game.flood();
  } else if (key === ' ') {
    event.preventDefault();
    unlock();
    game.startWave();
  } else if (['1', '2', '3', '4', '5'].includes(key)) {
    event.preventDefault();
    selectedTower = Object.keys(TOWERS)[Number(key) - 1];
    renderBuild();
  } else if (key === 'arrowright' || key === 'arrowleft') {
    event.preventDefault();
    selectedPad =
      (Math.max(0, selectedPad) + (key === 'arrowright' ? 1 : 11)) % 12;
    renderPads();
    renderBuild();
  } else if (key === 'enter') {
    event.preventDefault();
    if (game.build(selectedPad, selectedTower)) sound('build');
  }
});
function backgroundPause() {
  if (
    visible === 'run' &&
    game.state &&
    !game.state.paused &&
    ['battle', 'build', 'draft'].includes(game.state.phase)
  )
    game.pause(true);
  else save();
}
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) backgroundPause();
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => renderer.resize());
setInterval(() => {
  if (visible === 'run' && game.state?.phase === 'battle') save();
}, 2000);
game.on('change', renderRun);
game.on('save', save);
game.on('gameover', handleResult);
game.on('wave', () => sound('wave'));
game.on('flood', () => sound('flood'));
game.on('hurt', () => sound('hurt'));
game.on('wave-clear', () => sound('choose'));
function frame(time) {
  const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.1) : 0;
  lastFrame = time;
  if (visible === 'run') {
    game.update(dt * (fast ? 2 : 1));
    renderer.draw(
      game,
      selectedPad,
      reduced ? 0 : time / 1000,
      reduced,
      selectedTower,
    );
    if (time - lastHud > 100) {
      updateHud();
      lastHud = time;
    }
  }
  requestAnimationFrame(frame);
}
if ('serviceWorker' in navigator)
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(() => {}),
  );
syncSound();
renderMenu();
requestAnimationFrame(frame);
