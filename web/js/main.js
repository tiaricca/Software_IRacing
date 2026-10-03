import { Steering } from './steering.js';
import { createTurnDetector } from './detector.js';
import { scoreLap } from './scoring.js';
import { renderTrackMap } from './trackmap.js';
import * as fb from './feedback.js';

const DATA_URL = 'data/oulton-international.json';
const STORE_KEY = 'ta-spike-v1';
const CENTER_TOLERANCE = 5;
const RIGHT_LEARN_DEG = 25;
const MIN_LAP_BEFORE_FINISH = 10; // seconds

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const pct = (x) => `${Math.round(x * 100)}%`;
const DIR = { L: { arrow: '←', label: 'SINISTRA' }, R: { arrow: '→', label: 'DESTRA' } };
const INTENSITY = { minor: 'piega', small: 'leggera', medium: 'media', large: 'forte' };
const MODE_LABEL = { rookie: 'Rookie', driver: 'Driver', pro: 'Pro' };

const store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  },
  save(data) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  },
};

const steering = new Steering();
let ref = null;
let sensorsStarted = false;
let signLearned = false;
let mode = 'rookie';
let wakeLock = null;
let calib = null;
let drive = null;
let lastResult = null;

// ---------- navigation ----------

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  window.scrollTo(0, 0);
}

function go(name) {
  if (name !== 'calib' && name !== 'drive') {
    stopDrive();
    calib = null;
    leaveImmersive();
  }
  if (name === 'home') renderHome();
  if (name === 'study') renderStudy();
  show(name);
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-go]');
  if (target) go(target.dataset.go);
});

// ---------- immersive mode (Android: fullscreen + orientation lock) ----------

async function enterImmersive() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch { /* not supported (iPhone) */ }
  try {
    const type = screen.orientation?.type || '';
    await screen.orientation.lock(type.startsWith('landscape') ? type : 'landscape');
  } catch { /* not supported or not fullscreen */ }
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { /* ignored */ }
}

function leaveImmersive() {
  try { screen.orientation?.unlock?.(); } catch { /* ignored */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (wakeLock) wakeLock.release().catch(() => {});
}

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
  const readout = $('calib-readout');
  if (!$('screen-calib').hidden) {
    readout.textContent = centered
      ? `${Math.abs(value).toFixed(0)}° ${value > 2 ? 'D' : value < -2 ? 'S' : ''}`
      : '—';
    $('calib-warn').hidden = !(steering.source === 'motion' && steering.planar < 0.5);
    $('calib-warn').textContent = 'Tieni il telefono più verticale, con lo schermo verso di te.';
    calibStep();
  }
});

// ---------- home ----------

function renderHome() {
  const data = store.load();
  $('home-eyebrow').textContent = `${ref.simulator} · ${ref.car}`;
  $('home-title').textContent = ref.track;
  const majors = ref.corners.length;
  $('home-sub').textContent =
    `${ref.layout} · ${(ref.lengthM / 1000).toFixed(2).replace('.', ',')} km · ${majors} curve · senso orario`;
  // Show the best of the hardest mode played: assisted scores are easier.
  const best = data.best && typeof data.best === 'object' ? data.best : {};
  const hardest = ['pro', 'driver', 'rookie'].find((m) => best[m] != null);
  $('best-score').innerHTML = hardest
    ? `${best[hardest]}<small> ${MODE_LABEL[hardest]}</small>`
    : '—';
  $('attempts').textContent = (data.attempts || []).length;
  renderTrackMap($('home-map'), ref, { labels: false });
}

// ---------- study ----------

function renderStudy() {
  const data = store.load();
  const notes = data.notes || {};
  const map = renderTrackMap($('study-map'), ref, {
    onCornerClick: (id) => {
      map.highlight(id);
      document.getElementById(`corner-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });

  $('study-sequence').innerHTML = '<span class="eyebrow">Sequenza</span>' + ref.corners
    .map((c) => `<span class="seq seq-${c.dir}${c.minor ? ' seq-minor' : ''}" title="${c.id} ${c.name}">${DIR[c.dir].arrow}</span>`)
    .join('');

  const list = $('corner-list');
  list.replaceChildren();
  for (const c of ref.corners) {
    const li = document.createElement('li');
    li.id = `corner-${c.id}`;
    li.className = 'corner-item';
    li.innerHTML = `
      <div class="ci-head">
        <span class="ci-id">${c.id}</span>
        <span class="ci-name"></span>
        <span class="dir dir-${c.dir}">${DIR[c.dir].arrow} ${DIR[c.dir].label}</span>
      </div>
      <div class="ci-meta">${c.minor ? 'piega veloce' : `curva ${INTENSITY[c.intensity]}`} · ~${c.angleDeg}° · ~${c.apexKph} km/h <em>(stima)</em></div>
      <p class="ci-note"></p>
      <textarea rows="2" placeholder="Le mie note: riferimento di frenata, marcia, cosa evitare…"></textarea>`;
    li.querySelector('.ci-name').textContent = c.name;
    li.querySelector('.ci-note').textContent = c.note;
    const ta = li.querySelector('textarea');
    ta.value = notes[c.id] || '';
    ta.addEventListener('input', () => {
      const d = store.load();
      d.notes = { ...(d.notes || {}), [c.id]: ta.value };
      store.save(d);
    });
    li.addEventListener('click', (e) => { if (e.target !== ta) map.highlight(c.id); });
    list.append(li);
  }
}

// ---------- setup & calibration ----------

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
    err.textContent = e.message || 'Impossibile attivare i sensori.';
    err.hidden = false;
    return;
  }
  await enterImmersive();
  startCalibration();
});

function startCalibration() {
  calib = { step: 'center', since: null };
  $('btn-center').hidden = false;
  setCalibText('Tieni il telefono <b>in orizzontale, dritto</b>, come un volante in posizione centrale.<br>Poi tocca <b>Imposta centro</b>.');
  show('calib');
  setTimeout(() => {
    if (calib && !steering.source) {
      $('calib-warn').hidden = false;
      $('calib-warn').textContent = 'Nessun dato dai sensori. Su Android controlla: impostazioni del sito → Sensori di movimento → Consenti.';
    }
  }, 1500);
}

function setCalibText(html) { $('calib-text').innerHTML = html; }

$('btn-center').addEventListener('click', () => {
  steering.calibrateCenter();
  fb.cue.count();
  $('btn-center').hidden = true;
  if (signLearned) {
    calib = { step: 'hold', since: null };
    setCalibText('Centro impostato. <b>Resta fermo al centro…</b>');
  } else {
    calib = { step: 'right', since: null };
    setCalibText('Ora gira il telefono <b>a DESTRA →</b> come per affrontare una curva.');
  }
});

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
  for (const c of ref.corners) {
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
  for (const c of ref.corners) {
    const from = (c.brakeT ?? c.t) - 1.2;
    if (elapsed >= from && elapsed <= c.t + c.duration + 0.3) current = c;
  }
  return current;
}

function startDrive() {
  show('drive');
  $('drive-mode').textContent = MODE_LABEL[mode];
  $('btn-finish').disabled = true;
  $('cue').innerHTML = '';
  $('screen-drive').dataset.mode = mode;
  const minimap = mode === 'rookie' ? renderTrackMap($('drive-map'), ref, { labels: false }) : null;
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
             <div><div class="cue-name">${c.id} · ${c.name}</div>
             <div class="cue-dir dir-${c.dir}">${DIR[c.dir].label} · ${INTENSITY[c.intensity]}</div></div>`
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
  const result = scoreLap(ref, events, elapsed);
  result.mode = mode;
  saveAttempt(result);
  lastResult = result;
  leaveImmersive();
  renderResults(result);
  show('results');
}

$('btn-finish').addEventListener('click', finishLap);
$('btn-abort').addEventListener('click', () => go('setup'));
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && drive?.phase === 'lap' && !$('btn-finish').disabled) {
    e.preventDefault();
    finishLap();
  }
});

$('btn-retry').addEventListener('click', async () => {
  fb.unlock();
  await enterImmersive();
  startCalibration();
});

// ---------- results ----------

function saveAttempt(r) {
  const data = store.load();
  data.attempts = [...(data.attempts || []), {
    at: new Date().toISOString(), mode: r.mode, score: r.score, lap: +r.userLapTime.toFixed(2),
  }].slice(-50);
  data.best = { ...(data.best || {}) };
  data.best[r.mode] = Math.max(data.best[r.mode] ?? 0, r.score);
  store.save(data);
}

function renderResults(r) {
  $('res-score').textContent = r.score;
  $('res-sub').textContent =
    `${MODE_LABEL[r.mode]} · giro mentale ${fmtTime(r.userLapTime)} · riferimento stimato ${fmtTime(r.refLapTime)}`;

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
    return `<tr><td class="ci-id">${c.id}</td><td>${c.name}</td>
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

$('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('res-raw').textContent);
    $('btn-copy').textContent = 'Copiato';
  } catch {
    $('btn-copy').textContent = 'Copia non riuscita';
  }
  setTimeout(() => { $('btn-copy').textContent = 'Copia JSON'; }, 1500);
});

// ---------- boot ----------

async function boot() {
  const res = await fetch(DATA_URL);
  ref = await res.json();
  go('home');
}

boot().catch((e) => {
  document.body.innerHTML = `<p class="error" style="padding:16px">Errore nel caricamento dei dati: ${e.message}</p>`;
});
