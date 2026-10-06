// Season calendar logic (pure). Which week is current is computed from the
// calendar data and the clock, never hard-coded in the UI.

const DAY_MS = 24 * 60 * 60 * 1000;

export function weekStartMs(season, week) {
  const [hh, mm] = (season.calendar?.weekStartUTC || '00:00').split(':').map(Number);
  const [y, mo, d] = week.start.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm);
}

export function weekEndMs(season, index) {
  const next = season.weeks[index + 1];
  return next ? weekStartMs(season, next) : weekStartMs(season, season.weeks[index]) + 7 * DAY_MS;
}

// { phase: 'before' | 'running' | 'after', current: index|null, next: index|null }
export function seasonPosition(season, nowMs) {
  const weeks = season.weeks;
  if (nowMs < weekStartMs(season, weeks[0])) return { phase: 'before', current: null, next: 0 };
  for (let i = 0; i < weeks.length; i++) {
    if (nowMs < weekEndMs(season, i)) {
      return { phase: 'running', current: i, next: i + 1 < weeks.length ? i + 1 : null };
    }
  }
  return { phase: 'after', current: null, next: null };
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// "6–12 ott" or "29 set–5 ott" (dates of the UTC calendar days of the week)
export function weekRangeLabel(season, index) {
  const a = new Date(weekStartMs(season, season.weeks[index]));
  const b = new Date(weekEndMs(season, index) - DAY_MS);
  const da = a.getUTCDate();
  const db = b.getUTCDate();
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${da}–${db} ${MONTHS[b.getUTCMonth()]}`
    : `${da} ${MONTHS[a.getUTCMonth()]}–${db} ${MONTHS[b.getUTCMonth()]}`;
}

export function findWeekByLayout(season, layoutId) {
  const index = season.weeks.findIndex((w) => w.layoutId === layoutId);
  return index < 0 ? null : { index, week: season.weeks[index] };
}
