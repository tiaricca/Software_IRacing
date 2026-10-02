import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTurnDetector } from '../web/js/detector.js';
import { scoreLap } from '../web/js/scoring.js';

const ref = JSON.parse(readFileSync(new URL('../web/data/oulton-international.json', import.meta.url)));
const PEAK = { minor: 14, small: 15, medium: 30, large: 50 };

// Simulated phone steering for a lap: ramp in, hold, ramp out for each corner,
// sampled at 60 Hz, with optional time scale and per-corner overrides.
function simulateLap({ scale = 1, flip = new Set(), skip = new Set(), noise = 0 } = {}) {
  const lapTime = ref.refLapTime * scale;
  const segs = ref.corners
    .filter((c) => !skip.has(c.id))
    .map((c) => {
      const sign = (c.dir === 'R' ? 1 : -1) * (flip.has(c.id) ? -1 : 1);
      return { t0: c.t * scale, t1: (c.t + Math.max(c.duration, 0.4)) * scale, peak: sign * PEAK[c.intensity] };
    });
  const detector = createTurnDetector();
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let t = 0; t <= lapTime; t += 1 / 60) {
    let v = 0;
    for (const s of segs) {
      if (t < s.t0 || t > s.t1) continue;
      const ramp = Math.min(0.15, (s.t1 - s.t0) / 3);
      const k = Math.min(1, (t - s.t0) / ramp, (s.t1 - t) / ramp);
      v = s.peak * k;
    }
    detector.push(t, v + noise * rand());
  }
  return { events: detector.finish(lapTime), lapTime };
}

test('reference data is consistent', () => {
  assert.equal(ref.corners.length, 17);
  assert.equal(ref.direction, 'clockwise');
  for (let i = 1; i < ref.corners.length; i++) {
    assert.ok(ref.corners[i].t > ref.corners[i - 1].t, `${ref.corners[i].id} after previous`);
  }
  assert.equal(ref.path.length, ref.pathT.length);
});

test('detector ignores small wobble and separates a chicane', () => {
  const d = createTurnDetector();
  const samples = [];
  for (let t = 0; t < 1; t += 1 / 60) samples.push([t, 4 * Math.sin(t * 20)]); // wobble
  for (let t = 1; t < 1.5; t += 1 / 60) samples.push([t, 35]); // right
  for (let t = 1.5; t < 2; t += 1 / 60) samples.push([t, -35]); // straight into left
  for (let t = 2; t < 2.5; t += 1 / 60) samples.push([t, 0]);
  samples.forEach(([t, v]) => d.push(t, v));
  const ev = d.finish(2.5);
  assert.deepEqual(ev.map((e) => e.dir), ['R', 'L']);
});

test('perfect lap scores high', () => {
  const { events, lapTime } = simulateLap();
  const r = scoreLap(ref, events, lapTime);
  assert.equal(r.missed, 0);
  assert.equal(r.wrong, 0);
  assert.equal(r.extras, 0);
  assert.ok(r.score >= 90, `score ${r.score}`);
});

test('slower mental lap is normalised, not punished', () => {
  const { events, lapTime } = simulateLap({ scale: 1.15 });
  const r = scoreLap(ref, events, lapTime);
  assert.equal(r.missed, 0);
  assert.ok(r.score >= 85, `score ${r.score}`);
});

test('starting the mental lap late after GO is not punished', () => {
  const { events, lapTime } = simulateLap();
  const late = events.map((e) => ({ ...e, t0: e.t0 + 3, t1: e.t1 + 3, tPeak: e.tPeak + 3 }));
  const r = scoreLap(ref, late, lapTime);
  assert.equal(r.missed, 0);
  assert.ok(r.timing > 0.9, `timing ${r.timing}`);
});

test('noisy hands still produce a clean lap', () => {
  const { events, lapTime } = simulateLap({ noise: 3 });
  const r = scoreLap(ref, events, lapTime);
  assert.equal(r.extras, 0);
  assert.ok(r.score >= 85, `score ${r.score}`);
});

test('wrong direction and forgotten corner are reported', () => {
  const { events, lapTime } = simulateLap({ flip: new Set(['T5']), skip: new Set(['T16']) });
  const r = scoreLap(ref, events, lapTime);
  const byId = Object.fromEntries(r.perCorner.map((p) => [p.corner.id, p.status]));
  assert.equal(byId.T5, 'wrong');
  assert.equal(byId.T16, 'missed');
  assert.ok(r.score < 90);
});

test('skipping flat-out kinks costs little', () => {
  const minors = new Set(ref.corners.filter((c) => c.minor).map((c) => c.id));
  const { events, lapTime } = simulateLap({ skip: minors });
  const r = scoreLap(ref, events, lapTime);
  assert.equal(r.missed, 0);
  assert.ok(r.score >= 90, `score ${r.score}`);
});

test('mirrored lap scores low', () => {
  const all = new Set(ref.corners.map((c) => c.id));
  const { events, lapTime } = simulateLap({ flip: all });
  const r = scoreLap(ref, events, lapTime);
  assert.ok(r.score < 50, `score ${r.score}`);
});
