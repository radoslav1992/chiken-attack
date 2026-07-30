/* Persistence: settings, high score table, lifetime stats and run autosave. */

const KEY = 'chicken-attack.v1';
const RUN_KEY = 'chicken-attack.run.v1';
const RUN_VERSION = 2;

const DEFAULTS = {
  sound: true,
  music: true,
  haptics: true,
  autofire: true,
  shake: true,
  showFps: false,
  controls: 'drag', // 'drag' = relative finger drag, 'follow' = absolute touch
  difficulty: 'veteran',
  scores: [], // [{ id, name, score, wave, difficulty, date }]
  lastName: 'PILOT',
  totalGames: 0,
  bestWave: 0,
  totalKills: 0,
  totalFood: 0,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    /* private mode / quota – gameplay continues without saving */
  }
}

export const settings = {
  get(key) {
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    persist();
    return value;
  },
  toggle(key) {
    return this.set(key, !state[key]);
  },
  all() {
    return { ...state };
  },
};

/* ------------------------------------------------------------- high scores -- */

export function highScore() {
  return state.scores.length ? state.scores[0].score : 0;
}

export function scores() {
  return state.scores.slice();
}

export function lifetimeStats() {
  return {
    games: state.totalGames || 0,
    bestWave: state.bestWave || 0,
    kills: state.totalKills || 0,
    food: state.totalFood || 0,
  };
}

let lastEntryId = null;

/**
 * Insert a run into the table and keep the top 10.
 * @returns {number} rank (1-based), or 0 when the run did not place.
 */
export function submitScore(score, wave, extra = {}) {
  state.totalGames += 1;
  state.bestWave = Math.max(state.bestWave || 0, wave);
  state.totalKills = (state.totalKills || 0) + (extra.kills || 0);
  state.totalFood = (state.totalFood || 0) + (extra.food || 0);

  const entry = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: (state.lastName || 'PILOT').slice(0, 8).toUpperCase(),
    score: Math.floor(score),
    wave,
    difficulty: extra.difficulty || 'veteran',
    date: new Date().toISOString().slice(0, 10),
  };
  lastEntryId = entry.id;

  const list = state.scores.slice();
  list.push(entry);
  list.sort((a, b) => b.score - a.score || b.wave - a.wave);
  state.scores = list.slice(0, 10);
  persist();

  const rank = state.scores.findIndex((e) => e.id === entry.id) + 1;
  return score > 0 ? rank : 0;
}

/** Rename the most recent run once the player types their initials. */
export function nameLastScore(name) {
  const clean = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]/g, '')
    .trim()
    .slice(0, 8);
  if (!clean) return false;
  state.lastName = clean;
  const entry = state.scores.find((e) => e.id === lastEntryId);
  if (entry) entry.name = clean;
  persist();
  return true;
}

export function lastName() {
  return state.lastName || 'PILOT';
}

/* --------------------------------------------------------------- run resume -- */

/**
 * Autosave of an in-progress run, written at each wave boundary so closing the
 * tab — or a phone evicting the PWA — does not throw the run away.
 */
export function saveRun(run) {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ v: RUN_VERSION, savedAt: Date.now(), ...run }));
  } catch (err) {
    /* ignore */
  }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    if (!run || run.v !== RUN_VERSION || !run.wave || run.lives <= 0) return null;
    return run;
  } catch (err) {
    return null;
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch (err) {
    /* ignore */
  }
}
