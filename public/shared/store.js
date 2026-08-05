/*
 * Namespaced local storage that never throws.
 *
 * Every game wrapped localStorage in the same try/catch, for the same reason:
 * Safari in private mode throws on setItem, and a game that dies because it
 * could not save a sound preference is a worse game than one that quietly
 * forgets it. Written out four times, it was four chances to forget the catch.
 *
 * Keys are namespaced by game slug because storage is shared across the whole
 * origin — `best` would collide, `beaver-dash.best` cannot.
 */

export function makeStore(namespace) {
  const key = (k) => `${namespace}.${k}`;

  return {
    /** Parsed JSON, or `fallback` if absent, corrupt, or storage is unavailable. */
    get(k, fallback = null) {
      try {
        const raw = localStorage.getItem(key(k));
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    set(k, value) {
      try {
        localStorage.setItem(key(k), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    del(k) {
      try {
        localStorage.removeItem(key(k));
      } catch {
        /* nothing to do — it is already as gone as we can make it */
      }
    },

    /** A raw string, for values that were never JSON (older saves). */
    getRaw(k, fallback = null) {
      try {
        const raw = localStorage.getItem(key(k));
        return raw == null ? fallback : raw;
      } catch {
        return fallback;
      }
    },

    setRaw(k, value) {
      try {
        localStorage.setItem(key(k), String(value));
        return true;
      } catch {
        return false;
      }
    },

    /** The full key, for anything that needs to address storage directly. */
    key,
  };
}

/**
 * The player's name, which every game asks for at game over and every game
 * cleaned the same way: upper case, a conservative character set, twelve
 * characters. Shared so a name saved in one game is not mangled differently in
 * the next.
 */
export function cleanName(raw, fallback = 'PLAYER') {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-_]/g, '')
    .trim()
    .slice(0, 12);
  return clean || fallback;
}
