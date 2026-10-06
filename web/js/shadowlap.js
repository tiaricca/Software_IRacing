// Shadow Lap: setup, calibration, lap and results (free training).
// Moved out of the spike's main.js; the sensing, calibration, iPhone rotation
// and scoring behaviour is unchanged. M3 replaces the modes with Guidato/Pro,
// the fixed lap duration and the exam context.

import { Steering } from './steering.js';
import { createTurnDetector } from './detector.js';
import { scoreLap } from './scoring.js';
import { renderTrackMap } from './trackmap.js';
import * as fb from './feedback.js';
import { DIR, INTENSITY, MODE_LABEL, esc } from './ui.js';

const CENTER_TOLERANCE = 5;
const RIGHT_LEARN_DEG = 25;
const MIN_LAP_BEFORE_FINISH = 10; // seconds

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const pct = (x) => `${Math.round(x * 100)}%`;

export const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const steering = new Steering();
let hooks = null; // { show, onExit, onAttempt, getRotationFlip, setRotationFlip }
let ctx = null; // { ref, key, title }
let sensorsStarted = false;
let signLearned = false;
let mode = 'rookie';
let wakeLock = null;
let calib = null;
let drive = null;

// ---------- immersive mode (Android: fullscreen + orientation lock) ----------

async function enterImmersive() {
  ensureWakeLock();
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* not supported (iPhone) */ }
  try {
    const type = screen.orientation?.type || '';
    await screen.orientation.lock(type.startsWith('landscape') ? type : 'landscape');
  } catch { /* not supported (iPhone) or not fullscreen */ }
}

function leaveImmersive() {
  try { screen.orientation?.unlock?.(); } catch { /* ignored */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (wakeLock) wakeLock.release().catch(() => {});
  applyRotation();
}

// Nobody touches the screen during a lap, so without a wake lock the phone
// auto-locks mid-lap. Called from every gesture of the flow (Safari may want
// user activation) and again when the page becomes visible.
function ensureWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  navigator.wakeLock.request('screen').then((lock) => {
    wakeLock = lock;
    lock.addEventListener('release', () => { wakeLock = null; });
  }).catch(() => { /* not supported or denied */ });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (calib || drive)) ensureWakeLock();
});

// ---------- screen rotation (iPhone) ----------
// Safari cannot lock the orientation. With the iOS rotation lock on, the page
// stays portrait while the phone is held like a wheel; with it off, iOS
// rotates the page in the middle of a hairpin. Either way, whenever the
// viewport is portrait during calibration or a lap, the immersive screens
// are rotated by CSS to stay aligned with the phone as held at calibration.

let holdRotation = 90; // CSS degrees that make a portrait page readable in the held landscape
let rotationFrozen = false;

function guessHoldRotation() {
  const { gx, gy } = steering;
  if (steering.source !== 'motion' || Math.abs(gx) < 1.3 * Math.abs(gy)) return null;
  // WebKit reports accelerationIncludingGravity with the opposite sign of
  // Chrome; the stored flip corrects a wrong guess once per device.
  const platform = IS_IOS ? -1 : 1;
  const flip = hooks.getRotationFlip() ? -1 : 1;
  return (gx > 0 ? 90 : -90) * platform * flip;
}

let appliedRotation = '';

function applyRotation() {
  const immersive = Boolean(calib || drive);
  const portrait = window.innerHeight > window.innerWidth;
  // Only for a phone actually used as a wheel: a narrow desktop window steered
  // with the mouse must not rotate.
  const deg = immersive && portrait && steering.source === 'motion' ? holdRotation : 0;
  const key = `${deg}|${window.innerWidth}x${window.innerHeight}|${Boolean(calib)}`;
  if (key === appliedRotation) return;
  appliedRotation = key;
  const root = document.documentElement.style;
  root.setProperty('--vw', `${window.innerWidth}px`);
  root.setProperty('--vh', `${window.innerHeight}px`);
  root.setProperty('--rot', `${deg}deg`);
  for (const s of document.querySelectorAll('.landscape')) s.classList.toggle('rotated', deg !== 0);
  $('btn-rotate').hidden = !(deg !== 0 && calib);
}

window.addEventListener('resize', applyRotation);
window.addEventListener('orientationchange', () => setTimeout(applyRotation, 50));

// ---------- steering meters ----------

steering.onSample((rawValue) => {
  // Before the centre is set the angle is relative to an arbitrary zero
  // (portrait), so a landscape phone would read ~90°: show nothing instead.
  const centered = calib?.step !== 'center';
  const value = centered ? rawValue : 0;
  const s = Math.max(-90, Math.min(90, value)) / 90;
  for (const fill of document.querySelectorAll('.meter-fill')) {
    fill.style.left = `${s >= 0 ? 50 : 50 + s * 50}%`;
    fill.style.width = `${Math.abs(s) * 50}%`;
    fill.classList.toggle('left', s < 0);
  }
  if (!$('screen-calib').hidden) {
    $('calib-readout').textContent = centered
      ? `${Math.abs(value).toFixed(0)}° ${value > 2 ? 'D' : value < -2 ? 'S' : ''}`
      : '—';
    $('calib-warn').hidden = !(steering.source === 'motion' && steering.planar < 0.5);
    $('calib-warn').textContent = 'Tieni il telefono più verticale, con lo schermo verso di te.';
    if (!rotationFrozen) {
      const guess = guessHoldRotation();
      if (guess != null) holdRotation = guess;
      applyRotation();
    }
    calibStep();
  }
});

// ---------- entry points ----------

export function initShadowLap(h) {
  hooks = h;
  $('ios-tip').hidden = !IS_IOS;

  $('btn-sensors').addEventListener('click', async () => {
    mode = document.querySelector('input[name="mode"]:checked').value;
    const err = $('setup-error');
    err.hidden = true;
    fb.unlock();
    try {
      if (!sensorsStarted) {
        await steering.start();
        sensorsStarted = true;
      }
    } catch (e) {
      err.textContent = IS_IOS
        ? 'Permesso ai sensori di movimento non concesso. Chiudi Safari (anche dalle app recenti), riapri il link e tocca "Consenti" quando richiesto.'
        : e.message || 'Impossibile attivare i sensori.';
      err.hidden = false;
      return;
    }
    await enterImmersive();
    startCalibration();
  });

  $('btn-center').addEventListener('click', onCenter);
  $('btn-rotate').addEventListener('click', () => {
    hooks.setRotationFlip(!hooks.getRotationFlip());
    holdRotation = -holdRotation;
    appliedRotation = '';
    applyRotation();
  });
  $('btn-calib-close').addEventListener('click', () => { abortShadowLap(); showSetup(); });
  $('btn-abort').addEventListener('click', () => { abortShadowLap(); showSetup(); });
  $('btn-finish').addEventListener('click', finishLap);
  for (const id of ['btn-setup-back', 'btn-results-back', 'btn-results-track']) {
    $(id).addEventListener('click', () => { abortShadowLap(); hooks.onExit(ctx); });
  }
  $('btn-retry').addEventListener('click', async () => {
    fb.unlock();
    await enterImmersive();
    startCalibration();
  });
  $('btn-copy').addEventListener('click', copyRaw);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && drive?.phase === 'lap' && !$('btn-finish').disabled) {
      e.preventDefault();
      finishLap();
    }
  });
}

export function openShadowSetup(context) {
  ctx = context;
  $('setup-track').textContent = context.title;
  $('setup-ref-note').textContent = context.refNote;
  showSetup();
}

function showSetup() {
  $('setup-error').hidden = true;
  hooks.show('setup');
}

export function abortShadowLap() {
  stopDrive();
  calib = null;
  leaveImmersive();
}

// ---------- calibration ----------

function startCalibration() {
  calib = { step: 'center', since: null };
  rotationFrozen = false;
  $('btn-center').hidden = false;
  setCalibText('Tieni il telefono <b>in orizzontale, dritto</b>, come un volante in posizione centrale.<br>Poi tocca <b>Imposta centro</b>.');
  hooks.show('calib');
  applyRotation();
  setTimeout(() => {
    if (calib && !steering.source) {
      $('calib-warn').hidden = false;
      $('calib-warn').textContent = IS_IOS
        ? 'Nessun dato dai sensori. Ricarica la pagina, tocca "Attiva sensori" e poi "Consenti".'
        : 'Nessun dato dai sensori. Su Android controlla: impostazioni del sito → Sensori di movimento → Consenti.';
    }
  }, 1500);
}

function setCalibText(html) { $('calib-text').innerHTML = html; }

function onCenter() {
  steering.calibrateCenter();
  ensureWakeLock();
  fb.unlock();
  // The phone is now held as it will be for the whole lap.
  rotationFrozen = true;
  applyRotation();
  fb.cue.count();
  $('btn-center').hidden = true;
  if (signLearned) {
    calib = { step: 'hold', since: null };
    setCalibText('Centro impostato. <b>Resta fermo al centro…</b>');
  } else {
    calib = { step: 'right', since: null };
    setCalibText('Ora gira il telefono <b>a DESTRA →</b> come per affrontare una curva.');
  }
}

function calibStep() {
  if (!calib) return;
  const now = performance.now();
  if (calib.step === 'right') {
    const delta = steering.rawDelta();
    if (Math.abs(delta) > RIGHT_LEARN_DEG) {
      steering.learnRightSign(delta);
      signLearned = true;
      fb.cue.right();
      calib = { step: 'hold', since: null };
      setCalibText('Perfetto. Ora <b>torna al centro</b> e resta fermo…');
    }
  } else if (calib.step === 'hold') {
    if (Math.abs(steering.value) < CENTER_TOLERANCE) {
      calib.since ??= now;
      if (now - calib.since > 1200) {
        calib = null;
        startDrive();
      }
    } else {
      calib.since = null;
    }
  }
}

// ---------- drive ----------

function buildCues() {
  const cues = [];
  for (const c of ctx.ref.corners) {
    if (mode === 'rookie') {
      if (c.brakeT != null) cues.push({ at: c.brakeT, fire: fb.cue.brake });
      cues.push({ at: c.t, fire: c.dir === 'R' ? fb.cue.right : fb.cue.left });
    } else if (mode === 'driver' && !c.minor) {
      cues.push({ at: c.brakeT ?? c.t, fire: c.brakeT != null ? fb.cue.brake : fb.cue.count });
    }
  }
  return cues.sort((a, b) => a.at - b.at);
}

function currentCorner(elapsed) {
  let current = null;
  for (const c of ctx.ref.corners) {
    const from = (c.brakeT ?? c.t) - 1.2;
    if (elapsed >= from && elapsed <= c.t + c.duration + 0.3) current = c;
  }
  return current;
}

function startDrive() {
  hooks.show('drive');
  $('drive-mode').textContent = MODE_LABEL[mode];
  $('btn-finish').disabled = true;
  $('cue').innerHTML = '';
  $('screen-drive').dataset.mode = mode;
  const minimap = mode === 'rookie' ? renderTrackMap($('drive-map'), ctx.ref, { labels: false }) : null;
  if (!minimap) $('drive-map').replaceChildren();

  drive = { phase: 'countdown', raf: 0, unsub: null, timers: [] };
  const cd = $('countdown');
  cd.hidden = false;
  let n = 3;
  const tick = () => {
    if (!drive) return;
    if (n > 0) {
      cd.textContent = n;
      fb.cue.count();
      n--;
      drive.timers.push(setTimeout(tick, 1000));
    } else {
      cd.textContent = 'GO';
      fb.cue.go();
      drive.timers.push(setTimeout(() => { cd.hidden = true; }, 600));
      beginLap(minimap);
    }
  };
  tick();
}

function beginLap(minimap) {
  const ref = ctx.ref;
  const t0 = performance.now() / 1000;
  const detector = createTurnDetector();
  const cues = buildCues();
  let nextCue = 0;
  let shownCorner = null;
  drive.phase = 'lap';
  drive.t0 = t0;
  drive.detector = detector;
  drive.unsub = steering.onSample((v, t) => detector.push(t - t0, v));

  const frame = () => {
    if (!drive || drive.phase !== 'lap') return;
    const elapsed = performance.now() / 1000 - t0;
    $('timer').textContent = fmtTime(elapsed);
    while (nextCue < cues.length && cues[nextCue].at <= elapsed) cues[nextCue++].fire();
    if (minimap) minimap.setGhost(elapsed <= ref.refLapTime ? elapsed : null);
    if (mode === 'rookie') {
      const c = currentCorner(elapsed);
      if (c !== shownCorner) {
        shownCorner = c;
        $('cue').innerHTML = c
          ? `<div class="cue-arrow dir-${c.dir}">${DIR[c.dir].arrow}</div>
             <div><div class="cue-name">${c.id} · ${esc(c.name)}</div>
             <div class="cue-dir dir-${c.dir}">${DIR[c.dir].label.toUpperCase()} · ${INTENSITY[c.intensity]}</div></div>`
          : '';
      }
    }
    if (elapsed > MIN_LAP_BEFORE_FINISH) $('btn-finish').disabled = false;
    // Rookie and Driver follow the reference pace, so the lap ends by itself
    // at the finish line; in Pro only the driver knows when they cross it.
    const autoFinish = mode === 'pro' ? ref.refLapTime * 1.8 : ref.refLapTime;
    if (elapsed >= autoFinish) { finishLap(); return; }
    drive.raf = requestAnimationFrame(frame);
  };
  drive.raf = requestAnimationFrame(frame);
}

function stopDrive() {
  if (!drive) return;
  cancelAnimationFrame(drive.raf);
  drive.timers.forEach(clearTimeout);
  drive.unsub?.();
  drive = null;
}

function finishLap() {
  if (!drive || drive.phase !== 'lap') return;
  const elapsed = performance.now() / 1000 - drive.t0;
  const events = drive.detector.finish(elapsed);
  stopDrive();
  fb.cue.go();
  const result = scoreLap(ctx.ref, events, elapsed);
  result.mode = mode;
  hooks.onAttempt(ctx, {
    at: new Date().toISOString(), mode, context: 'training', score: result.score, lap: +elapsed.toFixed(2),
  });
  leaveImmersive();
  renderResults(result);
  hooks.show('results');
}

// ---------- results ----------

function renderResults(r) {
  $('res-score').textContent = r.score;
  $('res-sub').textContent =
    `Allenamento libero · ${MODE_LABEL[r.mode]} · giro mentale ${fmtTime(r.userLapTime)} · riferimento stimato ${fmtTime(r.refLapTime)}`;

  const metric = (label, value, cls = '') => `<div class="metric ${cls}"><strong>${value}</strong><span>${label}</span></div>`;
  $('res-metrics').innerHTML = [
    metric('Curve ricordate', pct(r.recall)),
    metric('Direzione', pct(r.direction)),
    metric('Timing', pct(r.timing)),
    metric('Intensità', pct(r.intensity)),
    metric('Mancate', r.missed, r.missed ? 'bad' : ''),
    metric('Direzione sbagliata', r.wrong, r.wrong ? 'bad' : ''),
    metric('Movimenti extra', r.extras, r.extras ? 'bad' : ''),
  ].join('');

  renderTimeline(r);

  const rows = r.perCorner.map((p) => {
    const c = p.corner;
    const status = {
      ok: '<span class="st ok">✓</span>',
      wrong: '<span class="st bad">✗ direzione</span>',
      missed: '<span class="st bad">— mancata</span>',
      skipped: '<span class="st muted">piega saltata</span>',
    }[p.status];
    const detail = p.user
      ? `${p.dt >= 0 ? '+' : ''}${p.dt.toFixed(1)}s · ${INTENSITY[c.intensity]} → ${INTENSITY[p.userIntensity]}`
      : '';
    return `<tr><td class="ci-id">${c.id}</td><td>${esc(c.name)}</td>
      <td class="dir dir-${c.dir}">${DIR[c.dir].arrow}</td><td>${status}</td><td class="muted">${detail}</td></tr>`;
  });
  $('res-table').innerHTML = rows.join('');

  $('res-raw').textContent = JSON.stringify({
    mode: r.mode,
    score: r.score,
    userLapTime: +r.userLapTime.toFixed(2),
    steeringScale: Math.round(r.steeringScale),
    events: r.rawEvents.map((e) => ({
      dir: e.dir, t0: +e.t0.toFixed(2), t1: +e.t1.toFixed(2), peakDeg: Math.round(e.peakDeg),
    })),
  }, null, 1);
}

function renderTimeline(r) {
  const W = 1000;
  const x = (t) => (t / r.refLapTime) * W;
  const parts = [`<line x1="0" y1="50" x2="${W}" y2="50" class="tl-axis"/>`];
  for (const p of r.perCorner) {
    const c = p.corner;
    parts.push(`<rect x="${x(c.t)}" y="${c.minor ? 22 : 12}" width="${Math.max(4, x(c.duration))}" height="${c.minor ? 16 : 26}" class="tl-${c.dir}${c.minor ? ' tl-minor' : ''}"/>`);
    if (p.user) {
      parts.push(`<line x1="${x(c.t)}" y1="38" x2="${x(p.user.t)}" y2="62" class="tl-link ${p.status}"/>`);
    }
  }
  for (const u of r.userEvents) {
    const dur = (u.t1 - u.t0) * (r.refLapTime / r.userLapTime);
    parts.push(`<rect x="${x(u.t)}" y="62" width="${Math.max(4, x(dur))}" height="26" class="tl-${u.dir}"/>`);
  }
  for (const u of r.extraEvents) {
    parts.push(`<text x="${x(u.t)}" y="99" class="tl-extra">×</text>`);
  }
  $('res-timeline').innerHTML =
    `<svg viewBox="-10 0 ${W + 20} 104" preserveAspectRatio="none">${parts.join('')}</svg>`;
}

async function copyRaw() {
  try {
    await navigator.clipboard.writeText($('res-raw').textContent);
    $('btn-copy').textContent = 'Copiato';
  } catch {
    $('btn-copy').textContent = 'Copia non riuscita';
  }
  setTimeout(() => { $('btn-copy').textContent = 'Copia JSON'; }, 1500);
}
