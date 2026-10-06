import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { seasonPosition, weekRangeLabel, weekStartMs, findWeekByLayout } from '../web/js/season.js';
import * as store from '../web/js/store.js';
import { studySummary, trackStatus, continueTarget, homeStats, hasAnyProgress, chapterState } from '../web/js/progress.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../web/${p}`, import.meta.url)));
const season = read('data/seasons/f1600-rookie-2026s4.json');
const oulton = read('data/academies/oulton-international.json');
const ref = read(oulton.shadowLap.reference);
const KEY = store.academyKey(season.id, 'oulton-international');
const at = (iso) => Date.parse(iso);

// ---------- season ----------

test('season has 12 consecutive Tuesday weeks with unique layouts', () => {
  assert.equal(season.weeks.length, 12);
  const ids = new Set(season.weeks.map((w) => w.layoutId));
  assert.equal(ids.size, 12);
  season.weeks.forEach((w, i) => {
    assert.equal(w.week, i + 1);
    assert.equal(new Date(`${w.start}T00:00:00Z`).getUTCDay(), 2, `${w.start} is a Tuesday`);
    if (i) assert.equal(weekStartMs(season, w) - weekStartMs(season, season.weeks[i - 1]), 7 * 86400000);
  });
});

test('current week comes from the calendar and the clock', () => {
  assert.deepEqual(seasonPosition(season, at('2026-09-10T12:00:00Z')), { phase: 'before', current: null, next: 0 });
  assert.deepEqual(seasonPosition(season, at('2026-09-30T12:00:00Z')), { phase: 'running', current: 2, next: 3 });
  // Week change at 00:00 UTC on Tuesday (assumption flagged in the data).
  assert.equal(seasonPosition(season, at('2026-10-05T23:59:00Z')).current, 2);
  assert.equal(seasonPosition(season, at('2026-10-06T00:00:00Z')).current, 3);
  assert.deepEqual(seasonPosition(season, at('2026-12-07T12:00:00Z')), { phase: 'running', current: 11, next: null });
  assert.equal(seasonPosition(season, at('2026-12-08T00:00:00Z')).phase, 'after');
});

test('week labels and lookup', () => {
  assert.equal(weekRangeLabel(season, 2), '29 set–5 ott');
  assert.equal(weekRangeLabel(season, 3), '6–12 ott');
  assert.equal(findWeekByLayout(season, 'oulton-international').week.week, 3);
  assert.equal(findWeekByLayout(season, 'nope'), null);
});

// ---------- content ----------

const BLOCKS = new Set(['text', 'facts', 'list', 'callout', 'sequences', 'sequence', 'corner']);

test('only academies with a data file are linked, and none is marked complete', () => {
  for (const w of season.weeks) {
    if (!w.academy) continue;
    assert.ok(existsSync(new URL(`../web/data/academies/${w.academy}.json`, import.meta.url)), w.academy);
    const a = read(`data/academies/${w.academy}.json`);
    assert.equal(a.id, w.layoutId);
    assert.equal(a.seasonId, season.id);
    assert.notEqual(a.status, 'complete', 'no Academy is complete before M2/M3');
  }
  assert.equal(season.weeks.filter((w) => w.academy).length, 1, 'M1 ships only the Oulton pilot');
});

test('Oulton study chapters are valid and reference real corners and sources', () => {
  const chapters = oulton.study.chapters;
  assert.equal(new Set(chapters.map((c) => c.id)).size, chapters.length);
  assert.equal(chapters[0].kind, 'intro');
  assert.equal(chapters[chapters.length - 1].kind, 'summary');
  const cornerIds = ref.corners.map((c) => c.id);
  const usedSources = [];
  for (const c of chapters) {
    assert.ok(['ready', 'planned'].includes(c.status), c.id);
    assert.ok(c.title && c.summary, c.id);
    if (c.corners) {
      const [a, b] = c.corners;
      assert.ok(cornerIds.indexOf(a) >= 0 && cornerIds.indexOf(b) > cornerIds.indexOf(a), `${c.id} corner range`);
    }
    if (c.status !== 'ready') continue;
    assert.ok(c.blocks?.length, `${c.id} has content`);
    assert.ok(c.minutes >= 2 && c.minutes <= 5, `${c.id} is a 2-5 minute chapter`);
    for (const b of c.blocks) {
      assert.ok(BLOCKS.has(b.type), `${c.id}: unknown block ${b.type}`);
      if (b.type === 'corner') {
        assert.ok(cornerIds.includes(b.corner), `${c.id}: ${b.corner}`);
        const [a, z] = c.corners;
        const i = cornerIds.indexOf(b.corner);
        assert.ok(i >= cornerIds.indexOf(a) && i <= cornerIds.indexOf(z), `${b.corner} inside ${c.id}`);
      }
      usedSources.push(...(b.sources || []), ...(b.whereSources || []));
      (b.items || []).forEach((it) => usedSources.push(...(it.sources || [])));
    }
  }
  for (const id of usedSources) assert.ok(oulton.sources[id], `source ${id} is declared`);
  for (const s of Object.values(oulton.sources)) assert.ok(s.short && s.url && s.accessed && s.usage, s.title);
  // M1 scope: introduction + one representative sequence.
  const ready = chapters.filter((c) => c.status === 'ready').map((c) => c.kind);
  assert.deepEqual(ready, ['intro', 'sequence']);
});

test('study text does not invent car-specific numbers', () => {
  const text = JSON.stringify(oulton.study);
  assert.doesNotMatch(text, /km\/h|\bmarcia\s+\d|\b\d+(ª|a)\s+marcia/i);
});

// ---------- store ----------

test('spike data migrates once into the Oulton academy', () => {
  const spike = {
    attempts: [{ at: '2026-10-03T10:00:00.000Z', mode: 'rookie', score: 84, lap: 122.9 }],
    best: { rookie: 84 },
    notes: { T5: 'tornante' },
    rotationFlip: true,
  };
  const s1 = store.migrateSpike(store.emptyState(), spike, KEY);
  assert.equal(s1.academies[KEY].shadow.attempts.length, 1);
  assert.equal(s1.academies[KEY].shadow.attempts[0].context, 'training');
  assert.equal(s1.academies[KEY].notes.T5, 'tornante');
  assert.equal(s1.prefs.rotationFlip, true);
  assert.equal(s1.activity.length, 1);
  assert.equal(store.migrateSpike(s1, spike, KEY), s1, 'idempotent');
});

test('normalize rejects unknown data', () => {
  assert.deepEqual(store.normalize(null), store.emptyState());
  assert.deepEqual(store.normalize({ v: 99 }), store.emptyState());
  assert.equal(store.normalize({ v: 1, academies: { x: 1 } }).academies.x, 1);
});

test('reading, completing and resuming chapters', () => {
  let s = store.emptyState();
  assert.equal(trackStatus(s.academies[KEY]), 'not_started');
  assert.equal(hasAnyProgress(s), false);
  const intro = oulton.study.chapters[0];

  s = store.touchChapter(s, KEY, intro.id, 0, '2026-10-06T10:00:00.000Z');
  s = store.touchChapter(s, KEY, intro.id, 0.4, '2026-10-06T10:01:00.000Z');
  const p = s.academies[KEY];
  assert.equal(chapterState(p, intro), 'reading');
  assert.equal(p.study.chapters.intro.position, 0.4);
  assert.equal(trackStatus(p), 'in_progress');
  assert.equal(s.activity.filter((a) => a.type === 'chapter_started').length, 1, 'started logged once');

  let sum = studySummary(p, oulton);
  assert.equal(sum.next.id, 'intro');
  assert.equal(sum.nextState, 'reading');
  const cont = continueTarget(s, { [KEY]: oulton });
  assert.equal(cont.chapter.id, 'intro');
  assert.equal(cont.position, 0.4);

  s = store.completeChapter(s, KEY, intro.id, '2026-10-06T10:05:00.000Z');
  s = store.completeChapter(s, KEY, intro.id, '2026-10-06T10:06:00.000Z');
  assert.equal(s.activity.filter((a) => a.type === 'chapter_completed').length, 1, 'completed logged once');
  sum = studySummary(s.academies[KEY], oulton);
  assert.equal(sum.done, 1);
  assert.equal(sum.next.id, 'clay-hill-deer-leap', 'planned chapters are skipped');
  assert.equal(continueTarget(s, { [KEY]: oulton }), null, 'nothing half-read');

  // Reading again a completed chapter keeps it completed.
  s = store.touchChapter(s, KEY, intro.id, 0.1, '2026-10-06T11:00:00.000Z');
  assert.equal(chapterState(s.academies[KEY], intro), 'done');
});

test('shadow lap attempts count as activity and stats', () => {
  let s = store.emptyState();
  s = store.addShadowAttempt(s, KEY, { at: '2026-10-06T12:00:00.000Z', mode: 'pro', context: 'training', score: 71, lap: 110 });
  assert.equal(trackStatus(s.academies[KEY]), 'in_progress');
  assert.deepEqual(homeStats(s), { tracksStarted: 1, tracksPassed: 0, chaptersDone: 0, laps: 1 });
  assert.equal(s.activity.at(-1).type, 'shadow_lap');
});

test('notes are stored per academy', () => {
  const s = store.setNote(store.emptyState(), KEY, 'T16', 'corda tardi');
  assert.equal(s.academies[KEY].notes.T16, 'corda tardi');
});
