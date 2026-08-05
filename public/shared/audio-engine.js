/*
 * The synthesiser every game's sound effects are built from.
 *
 * No audio files anywhere in this arcade: a sound is an oscillator, an envelope
 * and sometimes a burst of filtered noise. That is why four games fit in a few
 * hundred kilobytes and work offline the first time you open them.
 *
 * WHAT LIVES HERE: the context, the master gain, the mute preference, and the
 * two primitives (`tone`, `noise`).
 *
 * WHAT DOES NOT: any actual sound. Each game keeps its own `sfx` table, because
 * which frequencies make a bumper sound like a bumper rather than a coin is the
 * game's character, not the platform's. The test for anything added here is
 * whether changing it for one game would be a bug for the other three.
 */

let ctx = null;
let master = null;
let on = true;
let prefKey = 'arcade.sound';

/** Call once, before anything else, so the mute preference is per game. */
export function configureAudio({ namespace, volume = 0.5 } = {}) {
  if (namespace) prefKey = `${namespace}.sound`;
  masterVolume = volume;
  try {
    on = localStorage.getItem(prefKey) !== 'off';
  } catch {
    on = true; // private mode: default to audible
  }
  if (master) master.gain.value = on ? masterVolume : 0;
}

let masterVolume = 0.5;

export function soundOn() {
  return on;
}

export function setSound(value) {
  on = !!value;
  try {
    localStorage.setItem(prefKey, on ? 'on' : 'off');
  } catch {
    /* the preference just will not survive the session */
  }
  if (master) master.gain.value = on ? masterVolume : 0;
}

/**
 * Create or resume the context. Must be called from a real user gesture the
 * first time — browsers will not start audio otherwise, and a context created
 * too early is stuck suspended for the life of the page.
 */
export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = on ? masterVolume : 0;
  master.connect(ctx.destination);
  return ctx;
}

export function suspend() {
  if (ctx && ctx.state === 'running') ctx.suspend();
}

export function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/** The live context, for games that build their own graph on top (music beds). */
export function audioContext() {
  return ctx;
}

export function masterGain() {
  return master;
}

/**
 * One oscillator with an envelope.
 *
 * The envelope ramps are exponential and never reach zero — `exponentialRamp`
 * to 0 is a no-op in the Web Audio spec and leaves the note ringing, so it goes
 * to 0.0001 instead. That single detail is the difference between a game that
 * plays sounds and a game that accumulates a drone.
 */
export function tone({ type = 'sine', from, to, dur = 0.12, gain = 0.2, delay = 0, destination } = {}) {
  if (!ctx || !on) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(destination || master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  return osc;
}

/** A burst of filtered noise: impacts, footsteps, anything with grit in it. */
export function noise({ dur = 0.12, gain = 0.14, delay = 0, hp = 400, destination } = {}) {
  if (!ctx || !on) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Decaying inside the buffer rather than on a gain node: cheaper, and it makes
  // every burst land the same way regardless of when it is scheduled.
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filt).connect(g).connect(destination || master);
  src.start(t0);
  return src;
}

/** A short haptic tap, where the device offers one. Silent failure elsewhere. */
export function vibrate(pattern) {
  if (!on) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* unsupported, or blocked by a permissions policy */
  }
}
