// Phone-as-steering-wheel input.
//
// The steering angle comes from the gravity vector projected on the screen
// plane (accelerationIncludingGravity x/y), not from Euler angles: with the
// phone held upright beta is near 90° and alpha/gamma become unstable
// (gimbal lock), and alpha drifts with the compass. Only the difference from
// the calibrated centre is used, so platform sign conventions don't matter;
// the right-turn sign is learned during calibration.
//
// Without motion sensors (desktop) the mouse X position or the arrow keys
// steer, so the whole flow can be tested on a computer.

const SMOOTHING_TAU = 0.05; // seconds

const wrap = (deg) => ((deg + 540) % 360) - 180;

export class Steering {
  constructor() {
    this.source = null; // 'motion' | 'pointer'
    this.raw = null;
    this.center = 0;
    this.sign = 1;
    this.value = 0;
    this.planar = 1; // share of gravity in the screen plane (tilt check)
    this._lastT = null;
    this._keys = { left: false, right: false, boost: false };
    this._listeners = new Set();
  }

  onSample(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  async start() {
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== 'granted') throw new Error('Permesso per i sensori di movimento negato.');
    }
    window.addEventListener('devicemotion', this._onMotion);
    window.addEventListener('pointermove', this._onPointer);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
    this._tick = setInterval(() => this._keyTick(), 16);
  }

  stop() {
    window.removeEventListener('devicemotion', this._onMotion);
    window.removeEventListener('pointermove', this._onPointer);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKey);
    clearInterval(this._tick);
  }

  calibrateCenter() {
    this.center = this.raw ?? 0;
    this.value = 0;
  }

  // Raw angle relative to the centre, before the learned sign is applied.
  rawDelta() {
    return this.raw == null ? 0 : wrap(this.raw - this.center);
  }

  learnRightSign(delta) {
    this.sign = delta >= 0 ? 1 : -1;
  }

  _onMotion = (e) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    this.source = 'motion';
    this.planar = Math.min(1, Math.hypot(g.x, g.y) / 9.81);
    this._feed(Math.atan2(g.x, g.y) * 180 / Math.PI);
  };

  _onPointer = (e) => {
    if (this.source === 'motion' || this._keys.left || this._keys.right) return;
    this.source = 'pointer';
    this._feed((e.clientX / window.innerWidth - 0.5) * 160);
  };

  _onKey = (e) => {
    const down = e.type === 'keydown';
    if (e.key === 'ArrowLeft') this._keys.left = down;
    else if (e.key === 'ArrowRight') this._keys.right = down;
    else if (e.key === 'Shift') this._keys.boost = down;
    else return;
    e.preventDefault();
  };

  _keyTick() {
    if (this.source === 'motion') return;
    const { left, right, boost } = this._keys;
    if (!left && !right && this.source !== 'keys') return;
    this.source = left || right ? 'keys' : 'pointer';
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    this._feed(this.center + target * (boost ? 50 : 25));
  }

  _feed(rawDeg) {
    const now = performance.now() / 1000;
    this.raw = rawDeg;
    const target = wrap(rawDeg - this.center) * this.sign;
    const dt = this._lastT == null ? 0.016 : Math.min(0.2, now - this._lastT);
    this._lastT = now;
    const alpha = 1 - Math.exp(-dt / SMOOTHING_TAU);
    this.value += (target - this.value) * alpha;
    for (const fn of this._listeners) fn(this.value, now);
  }
}
