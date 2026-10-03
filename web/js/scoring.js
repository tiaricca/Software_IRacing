// Shadow Lap scoring: align user turn events with the reference corners.
// The user's mental lap runs at their own pace and may start a little late
// after GO, so event times are mapped onto the reference clock (first by lap
// duration, then by a scale + offset fit on the matched corners) and aligned
// with a Needleman-Wunsch style dynamic programme (match / missed / extra).

const RANK = { minor: 0, small: 0, medium: 1, large: 2 };

// People rotate the phone very differently (one tester used 70-90° for
// hairpins), so intensity is relative to the user's own steering scale:
// the 80th percentile of their peaks in this lap.
const DEFAULT_SCALE = 50;

export function steeringScale(events) {
  if (events.length < 5) return DEFAULT_SCALE;
  const peaks = events.map((e) => e.peakDeg).sort((a, b) => a - b);
  return Math.max(20, peaks[Math.floor(0.8 * (peaks.length - 1))]);
}

export function phoneIntensity(peakDeg, scale = DEFAULT_SCALE) {
  const ratio = peakDeg / scale;
  if (ratio < 0.5) return 'small';
  if (ratio < 0.85) return 'medium';
  return 'large';
}

// Returning to centre after a big turn often overshoots slightly to the
// other side: drop movements that are tiny compared to the user's scale.
const OVERSHOOT_RATIO = 0.2;

const COST = {
  missedMajor: 1.0,
  missedMinor: 0.25,
  extra: 0.7,
  wrongDir: 0.9,
  maxTiming: 1.0,
};

// Least-squares t_ref = a * t + b over correctly matched corners, where t is
// the first-pass (duration-normalised) time. Only small corrections are
// accepted: a large one means the matches themselves are unreliable.
function fitClock(perCorner, refLapTime) {
  const pts = perCorner.filter((p) => p.status === 'ok').map((p) => [p.user.t, p.corner.t]);
  if (pts.length < 4) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  if (sxx === 0) return null;
  const a = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx;
  const b = my - a * mx;
  if (Math.abs(a - 1) > 0.15 || Math.abs(b) > 0.05 * refLapTime) return null;
  return { a, b };
}

export function alignLap(corners, userEvents, refLapTime, mapTime, scale = DEFAULT_SCALE) {
  const user = userEvents.map((e) => ({ ...e, t: mapTime(e.t0) }));
  const maxDt = 0.05 * refLapTime;
  const n = corners.length;
  const m = user.length;

  const matchCost = (c, u) => {
    const dt = Math.abs(c.t - u.t);
    if (dt > maxDt) return Infinity;
    return c.dir === u.dir ? COST.maxTiming * (dt / maxDt) : COST.wrongDir;
  };
  const missCost = (c) => (c.minor ? COST.missedMinor : COST.missedMajor);

  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 match, 2 miss, 3 extra
  for (let i = 1; i <= n; i++) { D[i][0] = D[i - 1][0] + missCost(corners[i - 1]); B[i][0] = 2; }
  for (let j = 1; j <= m; j++) { D[0][j] = D[0][j - 1] + COST.extra; B[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const a = D[i - 1][j - 1] + matchCost(corners[i - 1], user[j - 1]);
      const b = D[i - 1][j] + missCost(corners[i - 1]);
      const c = D[i][j - 1] + COST.extra;
      if (a <= b && a <= c) { D[i][j] = a; B[i][j] = 1; }
      else if (b <= c) { D[i][j] = b; B[i][j] = 2; }
      else { D[i][j] = c; B[i][j] = 3; }
    }
  }

  const perCorner = new Array(n);
  const extras = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = B[i][j];
    if (step === 1) {
      const c = corners[i - 1];
      const u = user[j - 1];
      perCorner[i - 1] = {
        corner: c,
        status: c.dir === u.dir ? 'ok' : 'wrong',
        user: u,
        dt: u.t - c.t,
        userIntensity: phoneIntensity(u.peakDeg, scale),
      };
      i--; j--;
    } else if (step === 2) {
      const c = corners[i - 1];
      perCorner[i - 1] = { corner: c, status: c.minor ? 'skipped' : 'missed' };
      i--;
    } else {
      extras.push(user[j - 1]);
      j--;
    }
  }
  extras.reverse();
  return { perCorner, extras, user };
}

export function scoreLap(ref, rawEvents, userLapTime) {
  const lap = ref.refLapTime;
  const steer = steeringScale(rawEvents);
  const userEvents = rawEvents.filter((e) => e.peakDeg >= OVERSHOOT_RATIO * steer);
  const scale = userLapTime > 0 ? lap / userLapTime : 1;
  let aligned = alignLap(ref.corners, userEvents, lap, (t) => t * scale, steer);
  const clock = fitClock(aligned.perCorner, lap);
  if (clock) {
    const refit = alignLap(ref.corners, userEvents, lap, (t) => clock.a * t * scale + clock.b, steer);
    const okCount = (r) => r.perCorner.filter((p) => p.status === 'ok').length;
    if (okCount(refit) >= okCount(aligned)) aligned = refit;
  }
  const { perCorner, extras, user } = aligned;

  const majors = perCorner.filter((p) => !p.corner.minor);
  const matched = perCorner.filter((p) => p.status === 'ok' || p.status === 'wrong');
  const ok = perCorner.filter((p) => p.status === 'ok');
  const recalled = majors.filter((p) => p.status === 'ok' || p.status === 'wrong').length;

  const recall = majors.length ? recalled / majors.length : 0;
  const direction = matched.length ? ok.length / matched.length : 0;
  const timingTol = 0.05 * lap;
  const timing = ok.length
    ? ok.reduce((s, p) => s + Math.max(0, 1 - Math.abs(p.dt) / timingTol), 0) / ok.length
    : 0;
  const intensity = ok.length
    ? ok.reduce((s, p) => {
        const diff = Math.abs(RANK[p.corner.intensity] - RANK[p.userIntensity]);
        return s + (diff === 0 ? 1 : diff === 1 ? 0.5 : 0);
      }, 0) / ok.length
    : 0;

  // The score is driven by corners done in the right direction: a corner
  // turned the wrong way is remembered, but not known.
  const correct = majors.length ? majors.filter((p) => p.status === 'ok').length / majors.length : 0;
  const raw = 100 * correct * (0.6 + 0.25 * timing + 0.15 * intensity);
  const score = Math.round(Math.max(0, Math.min(100, raw - 2 * extras.length)));

  return {
    score,
    recall,
    direction,
    timing,
    intensity,
    missed: perCorner.filter((p) => p.status === 'missed').length,
    wrong: perCorner.filter((p) => p.status === 'wrong').length,
    extras: extras.length,
    userLapTime,
    refLapTime: lap,
    perCorner,
    extraEvents: extras,
    userEvents: user,
    rawEvents,
    steeringScale: steer,
  };
}
