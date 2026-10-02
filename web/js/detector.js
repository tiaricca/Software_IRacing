// Turn detection: steering angle stream -> discrete left/right turn events.
// Hysteresis (enter/exit thresholds) + minimum duration filter out small
// involuntary movements. Times are in seconds, angles in degrees (+ = right).

export const DETECTOR_DEFAULTS = {
  enterDeg: 10,
  exitDeg: 5,
  minDuration: 0.12,
};

export function createTurnDetector(options = {}) {
  const cfg = { ...DETECTOR_DEFAULTS, ...options };
  const events = [];
  let active = null;

  function close(t) {
    if (active && t - active.t0 >= cfg.minDuration) {
      events.push({
        dir: active.dir,
        t0: active.t0,
        t1: t,
        peakDeg: active.peak,
        tPeak: active.tPeak,
      });
    }
    active = null;
  }

  function open(t, dir, mag) {
    active = { dir, t0: t, peak: mag, tPeak: t };
  }

  return {
    push(t, steerDeg) {
      const mag = Math.abs(steerDeg);
      const dir = steerDeg > 0 ? 'R' : 'L';
      if (!active) {
        if (mag >= cfg.enterDeg) open(t, dir, mag);
        return;
      }
      if (dir !== active.dir) {
        // Quick direction change (chicane): close and maybe open the other side.
        close(t);
        if (mag >= cfg.enterDeg) open(t, dir, mag);
        return;
      }
      if (mag < cfg.exitDeg) {
        close(t);
        return;
      }
      if (mag > active.peak) {
        active.peak = mag;
        active.tPeak = t;
      }
    },
    finish(t) {
      close(t);
      return events.slice();
    },
    get events() {
      return events;
    },
  };
}
