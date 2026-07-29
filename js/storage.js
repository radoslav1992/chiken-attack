/* Persistence: settings + high score table, all in localStorage. */

const KEY = 'chicken-attack.v1';

const DEFAULTS = {
  sound: true,
  music: true,
  haptics: true,
  autofire: true,
  showFps: false,
  controls: 'drag', // 'drag' = relative finger drag, 'follow' = absolute touch
  scores: [], // [{ name, score, wave, date }]
  lastName: 'PILOT',
  totalGames: 0,
  bestWave: 0,
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

export function highScore() {
  return state.scores.length ? state.scores[0].score : 0;
}

export function scores() {
  return state.scores.slice();
}

/** Insert a run into the table, keep the top 10, return its rank (1-based) or 0. */
export function submitScore(score, wave, name) {
  state.totalGames += 1;
  state.bestWave = Math.max(state.bestWave || 0, wave);
  if (name) state.lastName = name.slice(0, 8).toUpperCase();

  const entry = {
    name: (name || state.lastName || 'PILOT').slice(0, 8).toUpperCase(),
    score: Math.floor(score),
    wave,
    date: new Date().toISOString().slice(0, 10),
  };

  const list = state.scores.slice();
  list.push(entry);
  list.sort((a, b) => b.score - a.score || b.wave - a.wave);
  state.scores = list.slice(0, 10);
  persist();

  const rank = state.scores.indexOf(entry) + 1;
  return score > 0 ? rank : 0;
}
