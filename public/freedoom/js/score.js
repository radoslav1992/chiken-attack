/*
 * What a run of Freedoom is worth on the arcade's board. The game itself keeps
 * no score, so the page makes one from what the engine reports at the end of
 * each level. Pure functions: the tests import this file directly.
 */

/** Skill 0-4 as the engine numbers them, easiest first. */
export const SKILL = [0.5, 0.75, 1, 1.5, 2];

/** Points for finishing a level. */
export function levelScore({ kills, totalKills, items, secrets, seconds, skill }) {
  const mult = SKILL[skill] ?? 1;
  const allDead = totalKills > 0 && kills >= totalKills ? 1000 : 0;
  const pace = Math.max(0, 600 - seconds) * 5;
  return Math.round((1000 + kills * 100 + items * 25 + secrets * 500 + allDead + pace) * mult);
}

/** Part credit for the level the player died on: the kills, at half rate. */
export function deathScore({ kills, skill }) {
  return Math.round(kills * 50 * (SKILL[skill] ?? 1));
}
