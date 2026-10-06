// Local progress, stored only in this browser (no account, no sync).
//
// Progress is keyed by a stable academy key "<seasonId>:<layoutId>", never by
// week number, so a corrected calendar does not move or lose progress.
// The pure helpers (emptyState, migrateSpike, ...) are tested in Node; the
// IO functions degrade to in-memory state when storage is unavailable.

export const STORE_KEY = 'ta-mvp-v1';
export const SPIKE_KEY = 'ta-spike-v1';
const MAX_ATTEMPTS = 50;
const MAX_ACTIVITY = 40;

export function emptyState() {
  // The theme preference lives in its own key ('ta-theme', see theme.js) so
  // it can be applied before the app loads.
  return { v: 1, prefs: { rotationFlip: false }, academies: {}, activity: [] };
}

export function academyKey(seasonId, layoutId) {
  return `${seasonId}:${layoutId}`;
}

export function emptyAcademy() {
  return { study: { chapters: {}, lastChapter: null }, shadow: { attempts: [] }, notes: {} };
}

// The Shadow Lap spike only ever existed for Oulton International.
export function migrateSpike(state, spike, oultonKey) {
  if (!spike || state.migratedSpike) return state;
  const next = structuredClone(state);
  const a = next.academies[oultonKey] ?? emptyAcademy();
  const attempts = Array.isArray(spike.attempts) ? spike.attempts : [];
  a.shadow.attempts = [
    ...attempts.map((x) => ({ at: x.at, mode: x.mode, context: 'training', score: x.score, lap: x.lap })),
    ...a.shadow.attempts,
  ].slice(-MAX_ATTEMPTS);
  if (spike.notes && typeof spike.notes === 'object') a.notes = { ...spike.notes, ...a.notes };
  next.academies[oultonKey] = a;
  if (spike.rotationFlip) next.prefs.rotationFlip = true;
  for (const x of attempts) {
    next.activity.push({ at: x.at, type: 'shadow_lap', academy: oultonKey, mode: x.mode, score: x.score });
  }
  next.activity.sort((p, q) => (p.at < q.at ? -1 : 1));
  next.activity = next.activity.slice(-MAX_ACTIVITY);
  next.migratedSpike = true;
  return next;
}

export function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
  return {
    ...base,
    ...raw,
    prefs: { ...base.prefs, ...(raw.prefs || {}) },
    academies: raw.academies && typeof raw.academies === 'object' ? raw.academies : {},
    activity: Array.isArray(raw.activity) ? raw.activity : [],
  };
}

// ---- pure updates -----------------------------------------------------

function withAcademy(state, key, fn) {
  const next = structuredClone(state);
  const a = next.academies[key] ?? emptyAcademy();
  fn(a, next);
  next.academies[key] = a;
  return next;
}

export function touchChapter(state, key, chapterId, position, now) {
  return withAcademy(state, key, (a, next) => {
    const prev = a.study.chapters[chapterId];
    if (!prev) next.activity = [...next.activity, { at: now, type: 'chapter_started', academy: key, chapter: chapterId }].slice(-MAX_ACTIVITY);
    a.study.chapters[chapterId] = {
      startedAt: prev?.startedAt ?? now,
      completedAt: prev?.completedAt ?? null,
      position: Math.max(0, Math.min(1, position ?? prev?.position ?? 0)),
      updatedAt: now,
    };
    a.study.lastChapter = chapterId;
  });
}

export function completeChapter(state, key, chapterId, now) {
  return withAcademy(state, key, (a, next) => {
    const prev = a.study.chapters[chapterId] ?? { startedAt: now, position: 1 };
    const first = !prev.completedAt;
    a.study.chapters[chapterId] = { ...prev, position: 1, completedAt: prev.completedAt ?? now, updatedAt: now };
    a.study.lastChapter = chapterId;
    if (first) next.activity = [...next.activity, { at: now, type: 'chapter_completed', academy: key, chapter: chapterId }].slice(-MAX_ACTIVITY);
  });
}

export function addShadowAttempt(state, key, attempt) {
  return withAcademy(state, key, (a, next) => {
    a.shadow.attempts = [...a.shadow.attempts, attempt].slice(-MAX_ATTEMPTS);
    next.activity = [...next.activity, {
      at: attempt.at, type: 'shadow_lap', academy: key, mode: attempt.mode, score: attempt.score,
    }].slice(-MAX_ACTIVITY);
  });
}

export function setNote(state, key, cornerId, text) {
  return withAcademy(state, key, (a) => {
    a.notes = { ...a.notes, [cornerId]: text };
  });
}

// ---- IO ------------------------------------------------------------------

let memory = null;
let writable = true;

export function storageWritable() {
  return writable;
}

function readKey(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function load(oultonKey) {
  if (memory) return memory;
  let state = normalize(readKey(STORE_KEY));
  state = migrateSpike(state, readKey(SPIKE_KEY), oultonKey);
  memory = state;
  save(state);
  return state;
}

export function save(state) {
  memory = state;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    writable = true;
  } catch {
    writable = false;
  }
}

export function update(fn) {
  if (!memory) throw new Error('store.load() must run before store.update()');
  const next = fn(memory);
  save(next);
  return next;
}

export function reset() {
  memory = { ...emptyState(), migratedSpike: true, prefs: { ...memory.prefs } };
  try { localStorage.removeItem(SPIKE_KEY); } catch { /* ignored */ }
  save(memory);
  return memory;
}
