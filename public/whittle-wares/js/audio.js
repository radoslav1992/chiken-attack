/*
 * Whittle & Wares — the sounds this game makes.
 *
 * The synthesiser itself lives in /shared/audio-engine.js. What is left here is
 * the part that is this game's character: which frequencies make a gather sound
 * like picking something up rather than like a coin.
 */

import { tone, noise } from '../../shared/audio-engine.js';
import { configureAudio, unlock, setSound, soundOn } from '../../shared/audio-engine.js';

configureAudio({ namespace: 'whittle-wares' });

export { unlock, setSound, soundOn };

export const sfx = {
  step() {
    noise({ dur: 0.05, gain: 0.05, hp: 900 });
  },
  gather() {
    tone({ type: 'triangle', from: 520, to: 780, dur: 0.1, gain: 0.16 });
    noise({ dur: 0.09, gain: 0.07, hp: 1200 });
  },
  /** Rising pips as the satchel fills — the deeper the band, the higher. */
  found(band) {
    tone({ type: 'square', from: 420 + band * 90, to: 700 + band * 120, dur: 0.13, gain: 0.12 });
  },
  sting() {
    tone({ type: 'sawtooth', from: 300, to: 90, dur: 0.22, gain: 0.16 });
    noise({ dur: 0.16, gain: 0.1, hp: 300 });
  },
  gate() {
    noise({ dur: 0.3, gain: 0.12, hp: 200 });
    tone({ type: 'triangle', from: 180, to: 300, dur: 0.3, gain: 0.1 });
  },
  coin() {
    tone({ type: 'square', from: 880, dur: 0.06, gain: 0.13 });
    tone({ type: 'square', from: 1320, dur: 0.1, gain: 0.11, delay: 0.05 });
  },
  sale(n = 1) {
    for (let i = 0; i < Math.min(3, n); i++) {
      tone({ type: 'square', from: 660 + i * 220, dur: 0.08, gain: 0.11, delay: i * 0.06 });
    }
  },
  refuse() {
    tone({ type: 'sawtooth', from: 220, to: 150, dur: 0.16, gain: 0.12 });
  },
  walkout() {
    tone({ type: 'triangle', from: 300, to: 160, dur: 0.24, gain: 0.1 });
  },
  craft() {
    noise({ dur: 0.1, gain: 0.12, hp: 700 });
    tone({ type: 'triangle', from: 300, to: 560, dur: 0.18, gain: 0.14, delay: 0.05 });
  },
  buy() {
    tone({ type: 'triangle', from: 440, dur: 0.1, gain: 0.15 });
    tone({ type: 'triangle', from: 660, dur: 0.14, gain: 0.13, delay: 0.09 });
    tone({ type: 'triangle', from: 880, dur: 0.2, gain: 0.12, delay: 0.18 });
  },
  ui() {
    tone({ type: 'square', from: 520, dur: 0.05, gain: 0.08 });
  },
  day() {
    [392, 523, 659].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.3, gain: 0.11, delay: i * 0.12 }));
  },
  rent() {
    tone({ type: 'sawtooth', from: 160, to: 110, dur: 0.5, gain: 0.14 });
  },
  ruin() {
    [330, 262, 196, 147].forEach((f, i) =>
      tone({ type: 'sawtooth', from: f, to: f * 0.6, dur: 0.45, gain: 0.13, delay: i * 0.2 })
    );
  },
  spoil() {
    tone({ type: 'sine', from: 260, to: 120, dur: 0.3, gain: 0.1 });
  },
};
