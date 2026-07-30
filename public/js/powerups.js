/*
 * Timed power-ups. These sit alongside the permanent upgrades (weapon swaps and
 * power levels): each one drops as a gift box, runs for a fixed number of
 * seconds and shows a countdown chip in the HUD.
 *
 * `id` doubles as the pickup type, the buff key on the player and the sprite
 * suffix in art.js (`gift_<id>`), so adding one here is nearly all it takes.
 */

export const POWERUPS = {
  drones: {
    id: 'drones',
    name: 'Wing Drones',
    short: 'DRONES',
    blurb: 'Two escort drones fire alongside you.',
    color: '#a5d8ff',
    box: '#2f6fa8',
    duration: 22,
    glyph: 'drones',
  },
  overdrive: {
    id: 'overdrive',
    name: 'Overdrive',
    short: 'RAPID',
    blurb: 'Cuts your weapon cooldown almost in half.',
    color: '#ffd166',
    box: '#e08e0b',
    duration: 12,
    glyph: 'bolt',
  },
  magnet: {
    id: 'magnet',
    name: 'Drumstick Magnet',
    short: 'MAGNET',
    blurb: 'Food and gifts fly to you from across the screen.',
    color: '#ff8787',
    box: '#c92a2a',
    duration: 16,
    glyph: 'magnet',
  },
  double: {
    id: 'double',
    name: 'Golden Egg',
    short: 'x2',
    blurb: 'Doubles every point you score.',
    color: '#ffe066',
    box: '#b58900',
    duration: 20,
    glyph: 'x2',
  },
  warp: {
    id: 'warp',
    name: 'Time Warp',
    short: 'WARP',
    blurb: 'Chickens and eggs crawl; you do not.',
    color: '#c792ff',
    box: '#6741d9',
    duration: 9,
    glyph: 'clock',
  },
  nuke: {
    id: 'nuke',
    name: 'Pressure Cooker',
    short: 'NUKE',
    blurb: 'Detonates instantly and scours the screen.',
    color: '#ff6b6b',
    box: '#a61e4d',
    instant: true,
    glyph: 'nuke',
  },
};

export const POWERUP_IDS = Object.keys(POWERUPS);

/** Buffs shown in the HUD, in a stable order (shield is not a POWERUPS entry). */
export const BUFF_ORDER = ['drones', 'overdrive', 'magnet', 'double', 'warp'];

/** Tuning constants the game reads. */
export const DRONE_FIRE_SCALE = 1.7; // drones fire this much slower than the ship
export const DRONE_LEVEL_DROP = 2; // …and at a slightly lower power level
export const OVERDRIVE_COOLDOWN = 0.55;
export const MAGNET_RANGE = 340; // units
export const WARP_FACTOR = 0.45; // enemy/egg timescale
export const NUKE_DAMAGE = 60;
export const NUKE_DAMAGE_PER_WAVE = 18;

export function isPowerup(type) {
  return Object.prototype.hasOwnProperty.call(POWERUPS, type);
}
