// Derived progress (pure): what the UI shows is computed from stored facts,
// never stored twice. No exam exists yet (M2/M3), so no track is "passed".

export function chapterState(academyProgress, chapter) {
  if (chapter.status !== 'ready') return 'planned';
  const c = academyProgress?.study.chapters[chapter.id];
  if (!c) return 'todo';
  return c.completedAt ? 'done' : 'reading';
}

export function studySummary(academyProgress, academy) {
  const chapters = academy.study.chapters;
  const ready = chapters.filter((c) => c.status === 'ready');
  const done = ready.filter((c) => chapterState(academyProgress, c) === 'done');
  const last = academyProgress?.study.lastChapter;
  const lastChapter = ready.find((c) => c.id === last);
  // Resume the chapter left half-read, otherwise the first one not finished.
  const next = (lastChapter && chapterState(academyProgress, lastChapter) === 'reading')
    ? lastChapter
    : ready.find((c) => chapterState(academyProgress, c) !== 'done') ?? null;
  return {
    ready: ready.length,
    planned: chapters.length - ready.length,
    done: done.length,
    next,
    nextState: next ? chapterState(academyProgress, next) : null,
    started: ready.some((c) => chapterState(academyProgress, c) !== 'todo'),
  };
}

export function shadowSummary(academyProgress) {
  const attempts = academyProgress?.shadow.attempts ?? [];
  if (!attempts.length) return null;
  const last = attempts[attempts.length - 1];
  const bestByMode = {};
  for (const a of attempts) {
    if (bestByMode[a.mode] == null || a.score > bestByMode[a.mode]) bestByMode[a.mode] = a.score;
  }
  return { count: attempts.length, last, bestByMode };
}

// 'not_started' | 'in_progress' ('passed' arrives with the exam in M2/M3)
export function trackStatus(academyProgress) {
  if (!academyProgress) return 'not_started';
  const studied = Object.keys(academyProgress.study.chapters).length > 0;
  const lapped = academyProgress.shadow.attempts.length > 0;
  return studied || lapped ? 'in_progress' : 'not_started';
}

// Chapter to reopen from Home: the most recently touched one not completed.
export function continueTarget(state, academiesByKey) {
  let best = null;
  for (const [key, progress] of Object.entries(state.academies)) {
    const academy = academiesByKey[key];
    if (!academy) continue;
    for (const [chapterId, c] of Object.entries(progress.study.chapters)) {
      if (c.completedAt) continue;
      const chapter = academy.study.chapters.find((x) => x.id === chapterId && x.status === 'ready');
      if (!chapter) continue;
      if (!best || c.updatedAt > best.updatedAt) best = { key, academy, chapter, position: c.position, updatedAt: c.updatedAt };
    }
  }
  return best;
}

export function homeStats(state) {
  const progress = Object.values(state.academies);
  return {
    tracksStarted: progress.filter((p) => trackStatus(p) !== 'not_started').length,
    tracksPassed: 0,
    chaptersDone: progress.reduce((n, p) => n + Object.values(p.study.chapters).filter((c) => c.completedAt).length, 0),
    laps: progress.reduce((n, p) => n + p.shadow.attempts.length, 0),
  };
}

export function hasAnyProgress(state) {
  return Object.values(state.academies).some((p) => trackStatus(p) !== 'not_started');
}
