let context,
  enabled = true;
try {
  enabled = localStorage.getItem('dam-defender.sound') !== 'off';
} catch {}
export function soundOn() {
  return enabled;
}
export function setSound(value) {
  enabled = !!value;
  try {
    localStorage.setItem('dam-defender.sound', enabled ? 'on' : 'off');
  } catch {}
}
export function unlock() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  context ||= new Audio();
  if (context.state === 'suspended') context.resume().catch(() => {});
}
export function sound(kind) {
  if (!enabled || !context || context.state !== 'running') return;
  const tones = {
    build: [280, 420, 0.12],
    wave: [180, 260, 0.2],
    flood: [170, 40, 0.65],
    hurt: [90, 55, 0.15],
    win: [440, 880, 0.35],
    choose: [430, 650, 0.16],
    lose: [200, 65, 0.4],
  };
  const [from, to, duration] = tones[kind] || tones.build,
    time = context.currentTime;
  const osc = context.createOscillator(),
    gain = context.createGain();
  osc.type = kind === 'flood' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(from, time);
  osc.frequency.exponentialRampToValueAtTime(to, time + duration);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(
    kind === 'flood' ? 0.025 : 0.08,
    time + 0.01,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain).connect(context.destination);
  osc.start(time);
  osc.stop(time + duration + 0.01);
}
