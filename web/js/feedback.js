// Audio beeps (Web Audio) and vibration. The AudioContext must be created
// from a user gesture, so call unlock() inside a click handler.

let ctx = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function beep(freq = 660, duration = 0.12, volume = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// Not available on iOS Safari: silently ignored there.
export function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

export const cue = {
  right() { beep(880, 0.1); vibrate(40); },
  left() { beep(520, 0.1); vibrate([25, 40, 25]); },
  brake() { beep(300, 0.18, 0.3); vibrate(80); },
  count() { beep(600, 0.15); },
  go() { beep(1200, 0.35); vibrate(120); },
};
