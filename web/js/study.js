// Studio: chapter index, chapter reader (reusable block format), corner list.
//
// A chapter is data (see data/academies/*.json): a list of typed blocks
// rendered by the same code for every track. Reading position is saved while
// scrolling, so "Continua" reopens the exact chapter at the same point.

import * as store from './store.js';
import { chapterState, studySummary } from './progress.js';
import { renderTrackMap } from './trackmap.js';
import { esc, icon, DIR, INTENSITY } from './ui.js';

const SAVE_EVERY_MS = 800;
const nowIso = () => new Date().toISOString();

const STATE_LABEL = { done: 'Completato', reading: 'In corso', todo: 'Da leggere', planned: 'In preparazione' };

function chapterNumber(academy, chapter) {
  return academy.study.chapters.indexOf(chapter) + 1;
}

// ---------- index ----------

export function renderStudyIndex(root, app, layoutId) {
  const academy = app.academies[layoutId];
  const progress = app.progress(layoutId);
  const sum = studySummary(progress, academy);
  const items = academy.study.chapters.map((c, i) => {
    const st = chapterState(progress, c);
    const body = `<span class="chapter-num">${i + 1}</span>
      <span class="grow"><strong>${esc(c.title)}</strong><span class="meta">${esc(c.summary)}</span>
        <span class="meta mono">${c.minutes ? `${c.minutes} min · ` : ''}${STATE_LABEL[st]}</span></span>
      <span class="state-mark state-${st}">${st === 'done' ? icon.check : st === 'planned' ? icon.lock : icon.chevron}</span>`;
    return st === 'planned'
      ? `<li class="chapter disabled" aria-disabled="true">${body}</li>`
      : `<li><a class="chapter" href="#/pista/${layoutId}/studio/${c.id}">${body}</a></li>`;
  }).join('');

  root.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/pista/${layoutId}" aria-label="Torna alla pista">${icon.back}</a><span class="eyebrow">${esc(academy.circuit.name)}</span></header>
    <div class="eyebrow">Studio · ${esc(academy.layout.name)} · ${esc(academy.car)}</div>
    <h1 class="display xl">Studio</h1>
    <p class="sub">${sum.done}/${sum.ready} capitoli completati${sum.planned ? ` · ${sum.planned} in preparazione` : ''}. Apri i capitoli nell'ordine che preferisci.</p>
    <ol class="chapters">${items}</ol>
    ${sum.next ? `<a class="btn primary" href="#/pista/${layoutId}/studio/${sum.next.id}">${sum.nextState === 'reading' ? 'Continua' : 'Inizia'}: ${esc(sum.next.title)}</a>` : ''}
    <a class="card link-card" href="#/pista/${layoutId}/curve"><span class="badge-icon">${icon.flag}</span>
      <span class="grow"><strong class="card-title">Le ${app.refs[layoutId].corners.length} curve e le tue note</strong>
      <span class="meta">Elenco completo con direzione, dalla geometria del tracciato</span></span><span class="chev">${icon.chevron}</span></a>`;
  return null;
}

// ---------- blocks ----------

function sourceTag(academy, ids) {
  if (!ids?.length) return '';
  const names = ids.map((id) => {
    const s = academy.sources[id];
    return s ? `<a href="#fonte-${id}" data-source="${id}">${esc(s.short)}</a>` : '';
  }).filter(Boolean);
  return names.length ? `<span class="src">Fonte: ${names.join(' · ')}</span>` : '';
}

function cornerRef(ref, id) {
  return ref.corners.find((c) => c.id === id);
}

function renderBlock(block, ctx) {
  const { academy, ref, layoutId, progress } = ctx;
  switch (block.type) {
    case 'text':
      return `${block.title ? `<h3 class="block-title">${esc(block.title)}</h3>` : ''}
        <p class="${block.lead ? 'lead' : ''}">${esc(block.text)}</p>${sourceTag(academy, block.sources)}`;
    case 'facts':
      return `${block.title ? `<h3 class="block-title">${esc(block.title)}</h3>` : ''}
        <dl class="facts">${block.items.map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}${f.note ? `<small>${esc(f.note)}</small>` : ''}${sourceTag(academy, f.sources)}</dd></div>`).join('')}</dl>`;
    case 'list':
      return `${block.title ? `<h3 class="block-title">${esc(block.title)}</h3>` : ''}
        <ul class="bullets">${block.items.map((it) => `<li>${esc(it.text)}${sourceTag(academy, it.sources)}</li>`).join('')}</ul>`;
    case 'callout':
      return `<p class="callout">${esc(block.text)}</p>`;
    case 'sequences': {
      const seqs = academy.study.chapters.filter((c) => c.kind === 'sequence');
      const rows = seqs.map((c) => {
        const [a, b] = c.corners;
        const st = chapterState(progress, c);
        const label = `<span class="mono">${a}–${b}</span><span class="grow">${esc(c.title)}</span><span class="meta">${st === 'planned' ? 'in preparazione' : STATE_LABEL[st].toLowerCase()}</span>`;
        return st === 'planned' ? `<li class="disabled">${label}</li>` : `<li><a href="#/pista/${layoutId}/studio/${c.id}">${label}</a></li>`;
      }).join('');
      return `<h3 class="block-title">${esc(block.title)}</h3><p>${esc(block.text)}</p><ol class="seq-list">${rows}</ol>`;
    }
    case 'sequence': {
      const [a, b] = ctx.chapter.corners;
      const ids = ref.corners.map((c) => c.id);
      const list = ref.corners.slice(ids.indexOf(a), ids.indexOf(b) + 1);
      return `<h3 class="block-title">${esc(block.title)}</h3>
        <ol class="turn-chips">${list.map((c) => `<li class="dir-${c.dir}${c.minor ? ' minor' : ''}"><a href="#c-${c.id}" data-corner="${c.id}"><span class="mono">${c.id}</span> ${esc(c.name)} <b>${DIR[c.dir].arrow}</b></a></li>`).join('')}</ol>`;
    }
    case 'corner': {
      const c = cornerRef(ref, block.corner);
      if (!c) return '';
      return `<article class="corner-card" id="c-${c.id}">
        <header><span class="corner-badge dir-${c.dir}">${c.id.slice(1)}</span>
          <span class="grow"><strong>${esc(c.name)}</strong><span class="meta">${c.minor ? 'Piega' : `Curva ${INTENSITY[c.intensity]}`}</span></span>
          <span class="dir dir-${c.dir}">${DIR[c.dir].arrow} ${DIR[c.dir].label}</span></header>
        <p>${esc(block.where)}</p>${sourceTag(academy, block.whereSources)}
        ${block.guide?.length ? `<dl class="guide">${block.guide.map((g) => `<div><dt>${esc(g.label)}</dt><dd>${esc(g.text)}</dd></div>`).join('')}</dl>
        <span class="verify">Consiglio di guida generale · da verificare sulla ${esc(academy.car)}</span>` : ''}
      </article>`;
    }
    default:
      return '';
  }
}

function usedSources(chapter) {
  const ids = new Set();
  const add = (list) => (list || []).forEach((id) => ids.add(id));
  for (const b of chapter.blocks || []) {
    add(b.sources);
    add(b.whereSources);
    (b.items || []).forEach((it) => add(it.sources));
  }
  return [...ids];
}

// ---------- chapter reader ----------

export function renderChapter(root, app, layoutId, chapterId) {
  const academy = app.academies[layoutId];
  const ref = app.refs[layoutId];
  const chapters = academy.study.chapters;
  const chapter = chapters.find((c) => c.id === chapterId);
  const key = app.key(layoutId);
  const back = `#/pista/${layoutId}`;

  if (!chapter || chapter.status !== 'ready') {
    root.innerHTML = `<header class="topbar"><a class="icon-btn" href="${back}" aria-label="Torna alla pista">${icon.close}</a></header>
      <h1 class="display">${chapter ? esc(chapter.title) : 'Capitolo non trovato'}</h1>
      <p class="notice">${chapter ? 'Questo capitolo è in preparazione.' : 'Il capitolo richiesto non esiste.'}</p>
      <a class="btn" href="#/pista/${layoutId}/studio">Torna allo Studio</a>`;
    return null;
  }

  const n = chapterNumber(academy, chapter);
  const before = app.progress(layoutId)?.study.chapters[chapter.id];
  app.update((s) => store.touchChapter(s, key, chapter.id, before?.position ?? 0, nowIso()));
  const progress = app.progress(layoutId);
  const ctx = { academy, ref, layoutId, progress, chapter };
  const sources = usedSources(chapter);

  root.innerHTML = `
    <header class="topbar sticky reader-bar">
      <a class="icon-btn" href="${back}" aria-label="Chiudi e torna alla pista">${icon.close}</a>
      <div class="reader-progress" role="progressbar" aria-label="Avanzamento del capitolo" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <span class="mono small">${n}/${chapters.length}</span>
    </header>
    <div class="map-box ${chapter.map?.labels === 'focus' ? 'large' : ''}" id="chapter-map"></div>
    <div class="eyebrow">Studio · ${esc(academy.circuit.name)} · capitolo ${n}</div>
    <h1 class="display xl">${esc(chapter.title)}</h1>
    <p class="sub">${esc(chapter.summary)}</p>
    <div class="chapter-body">${chapter.blocks.map((b) => renderBlock(b, ctx)).join('')}</div>
    ${sources.length ? `<h3 class="section-label">Fonti</h3><ul class="sources">${sources.map((id) => {
      const s = academy.sources[id];
      return `<li id="fonte-${id}"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a><span class="meta">${esc(s.usage)} Consultata il ${esc(s.accessed)}.</span></li>`;
    }).join('')}</ul>` : ''}
    <div class="chapter-end" id="chapter-end"></div>`;

  // Map: whole track for the introduction, zoomed sequence otherwise.
  const focus = chapter.corners ? [chapter.corners[0], chapter.corners[chapter.corners.length - 1]] : null;
  const map = renderTrackMap(root.querySelector('#chapter-map'), ref, {
    labels: true,
    focus,
    onCornerClick: (id) => {
      map.highlight(id);
      document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });

  // In-page anchors must not go through the hash router.
  const onAnchor = (e) => {
    const a = e.target.closest('a[href^="#c-"], a[href^="#fonte-"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    if (a.dataset.corner) map.highlight(a.dataset.corner);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  root.addEventListener('click', onAnchor);

  const end = root.querySelector('#chapter-end');
  const nextChapter = () => {
    const p = app.progress(layoutId);
    const after = chapters.slice(chapters.indexOf(chapter) + 1).concat(chapters.slice(0, chapters.indexOf(chapter)));
    return after.find((c) => c.status === 'ready' && chapterState(p, c) !== 'done') ?? null;
  };
  const renderEnd = () => {
    const done = Boolean(app.progress(layoutId)?.study.chapters[chapter.id]?.completedAt);
    if (!done) {
      end.innerHTML = `<button class="btn primary" id="btn-complete">Capitolo completato</button>
        <p class="hint">Segnalo quando hai letto tutto: il capitolo risulterà completato nella pagina della pista.</p>`;
      end.querySelector('#btn-complete').addEventListener('click', () => {
        app.update((s) => store.completeChapter(s, key, chapter.id, nowIso()));
        renderEnd();
      });
      return;
    }
    const next = nextChapter();
    end.innerHTML = `<p class="done-line">${icon.check} Capitolo completato</p>
      ${next ? `<a class="btn primary" href="#/pista/${layoutId}/studio/${next.id}">Prossimo: ${esc(next.title)}</a>` : '<p class="hint">Hai completato tutti i capitoli disponibili per ora.</p>'}
      <a class="btn" href="${back}">Torna alla pista</a>`;
  };
  renderEnd();

  // Reading position: progress bar, periodic save, resume.
  const bar = root.querySelector('.reader-progress span');
  const fraction = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, window.scrollY / max) : 1;
  };
  let lastSave = 0;
  const save = () => {
    lastSave = Date.now();
    app.update((s) => store.touchChapter(s, key, chapter.id, fraction(), nowIso()));
  };
  const onScroll = () => {
    bar.style.width = `${fraction() * 100}%`;
    if (Date.now() - lastSave > SAVE_EVERY_MS) save();
  };
  const onHide = () => { if (document.visibilityState === 'hidden') save(); };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onHide);

  const resumeAt = before && !before.completedAt ? before.position : 0;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (resumeAt > 0.02 && max > 0) window.scrollTo(0, resumeAt * max);
    bar.style.width = `${fraction() * 100}%`;
    lastSave = Date.now();
  });

  return () => {
    save();
    root.removeEventListener('click', onAnchor);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onHide);
  };
}

// ---------- corner list with personal notes ----------

export function renderCorners(root, app, layoutId) {
  const academy = app.academies[layoutId];
  const ref = app.refs[layoutId];
  const key = app.key(layoutId);
  const notes = app.progress(layoutId)?.notes ?? {};

  root.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/pista/${layoutId}/studio" aria-label="Torna allo Studio">${icon.back}</a><span class="eyebrow">Studio</span></header>
    <div class="eyebrow">${esc(academy.circuit.name)} · ${esc(academy.layout.name)}</div>
    <h1 class="display xl">Le ${ref.corners.length} curve</h1>
    <p class="sub">Ordine e direzione dalla geometria del tracciato. Le note sono tue e restano su questo dispositivo.</p>
    <div class="map-box large" id="corners-map"></div>
    <div class="sequence-strip">${ref.corners.map((c) => `<span class="seq dir-${c.dir}${c.minor ? ' minor' : ''}" title="${c.id} ${esc(c.name)}">${DIR[c.dir].arrow}</span>`).join('')}</div>
    <ol class="corner-list">${ref.corners.map((c) => `
      <li class="corner-item" id="corner-${c.id}">
        <div class="ci-head"><span class="corner-badge dir-${c.dir}">${c.id.slice(1)}</span>
          <strong class="grow">${esc(c.name)}</strong>
          <span class="dir dir-${c.dir}">${DIR[c.dir].arrow} ${DIR[c.dir].label}</span></div>
        <div class="meta">${c.minor ? 'Piega' : `Curva ${INTENSITY[c.intensity]}`} · circa ${c.angleDeg}° di cambio di direzione</div>
        <textarea rows="2" data-corner="${c.id}" aria-label="Note su ${esc(c.name)}" placeholder="Le mie note: riferimenti, cosa ricordare…">${esc(notes[c.id] || '')}</textarea>
      </li>`).join('')}</ol>
    <p class="foot">Geometria © OpenStreetMap contributors (ODbL).</p>`;

  const map = renderTrackMap(root.querySelector('#corners-map'), ref, {
    onCornerClick: (id) => {
      map.highlight(id);
      document.getElementById(`corner-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });
  const timers = {};
  for (const ta of root.querySelectorAll('textarea[data-corner]')) {
    ta.addEventListener('input', () => {
      clearTimeout(timers[ta.dataset.corner]);
      timers[ta.dataset.corner] = setTimeout(() => {
        app.update((s) => store.setNote(s, key, ta.dataset.corner, ta.value));
      }, 300);
    });
    ta.addEventListener('focus', () => map.highlight(ta.dataset.corner));
  }
  return () => {
    for (const ta of root.querySelectorAll('textarea[data-corner]')) {
      clearTimeout(timers[ta.dataset.corner]);
      app.update((s) => store.setNote(s, key, ta.dataset.corner, ta.value));
    }
  };
}
