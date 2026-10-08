// Views: Home, Piste, pagina pista, impostazioni.
//
// M1-C rule of thumb: one primary action per screen, progress secondary,
// nothing that looks usable before it exists. Oulton is presented as the
// demo Academy, never as "this week's" track.

import { seasonPosition, weekRangeLabel, findWeekByLayout } from './season.js';
import {
  chapterState, nextStudyAction, shadowSummary, homeStats, hasAnyProgress,
} from './progress.js';
import { renderTrackMap } from './trackmap.js';
import { getTheme, setTheme } from './theme.js';
import * as store from './store.js';
import { esc, icon } from './ui.js';

function mountMaps(root, app) {
  for (const el of root.querySelectorAll('[data-map]')) {
    const ref = app.refs[el.dataset.map];
    if (ref) renderTrackMap(el, ref, { labels: false, variant: el.dataset.variant || null });
  }
}

const gearLink = `<a class="icon-btn" href="#/impostazioni" aria-label="Impostazioni">${icon.gear}</a>`;

// Chapter progress as one segment per chapter: done / reading / to do / planned.
function chapterSegments(app, layoutId) {
  const academy = app.academies[layoutId];
  const progress = app.progress(layoutId);
  return `<span class="segments" aria-hidden="true">${academy.study.chapters
    .map((c) => `<i class="seg-${chapterState(progress, c)}"></i>`).join('')}</span>`;
}

function studyCta(app, layoutId) {
  const academy = app.academies[layoutId];
  const action = nextStudyAction(app.progress(layoutId), academy);
  const total = academy.study.chapters.length;
  const href = action.chapter ? `#/pista/${layoutId}/studio/${action.chapter.id}` : `#/pista/${layoutId}/studio`;
  const label = {
    start: 'Inizia lo studio',
    continue: 'Continua lo studio',
    next: 'Continua lo studio',
    review: 'Rivedi lo studio',
    none: 'Apri lo studio',
  }[action.kind];
  const where = action.chapter ? `Capitolo ${action.index} di ${total}` : 'Studio';
  return { action, href, label, where, total };
}

// ---------- Home ----------

export function renderHome(root, app) {
  const s = app.season;
  const layoutId = Object.keys(app.academies)[0]; // the demo Academy (Oulton)
  const academy = app.academies[layoutId];
  const state = app.state();
  const returning = hasAnyProgress(state);
  const cta = studyCta(app, layoutId);
  const { action } = cta;
  const shadow = shadowSummary(app.progress(layoutId));

  const heroText = action.chapter
    ? `<span class="hero-meta">${cta.where}${action.chapter.minutes ? ` · ${action.chapter.minutes} min` : ''}</span>
       <strong class="hero-chapter">${esc(action.chapter.title)}</strong>`
    : `<span class="hero-meta">Capitoli disponibili completati</span>`;

  root.innerHTML = `<div class="fit">
    <header class="page-head">
      <div class="brand"><span class="mark"></span>Track Academy</div>
      ${gearLink}
    </header>
    <div class="intro">
      <div class="eyebrow">${esc(s.series)} · ${esc(s.car)}</div>
      <h1 class="display">${returning ? 'Bentornato' : 'Impara la pista prima di guidarla'}</h1>
      ${returning ? '<p class="sub">Riprendi da dove avevi lasciato.</p>' : ''}
    </div>
    <div class="hero-card grow-card">
      <div class="hero-top">
        <span class="tag-chip">${returning && action.kind !== 'start' ? 'In corso' : 'Academy demo'}</span>
        <span class="hero-car">${esc(academy.car)}</span>
      </div>
      <a class="hero-map" href="#/pista/${layoutId}" data-map="${layoutId}" data-variant="hero" aria-label="Apri ${esc(academy.circuit.name)}"></a>
      <div class="hero-title">
        <h2>${esc(academy.circuit.name)}</h2>
        <span class="hero-layout">${esc(academy.layout.name)}</span>
      </div>
      ${returning ? `<div class="hero-progress">${heroText}${chapterSegments(app, layoutId)}</div>` : ''}
      <a class="btn primary" href="${cta.href}">${cta.label}</a>
    </div>
    <div class="quick-row">
      <a class="quick" href="#/pista/${layoutId}/studio">${icon.study}<span><b>Studio</b><small>${action.sum.done}/${cta.total} capitoli</small></span></a>
      <a class="quick" href="#/shadow-lap">${icon.wheel}<span><b>Shadow Lap</b><small>${shadow ? `Ultimo ${shadow.last.score}/100` : 'Giro a memoria'}</small></span></a>
    </div>
  </div>`;
  mountMaps(root, app);
}

// ---------- Piste ----------

export function renderPiste(root, app) {
  const s = app.season;
  const pos = seasonPosition(s, app.now());
  const available = s.weeks.map((w, i) => ({ w, i })).filter(({ w }) => w.academy);
  const others = s.weeks.map((w, i) => ({ w, i })).filter(({ w }) => !w.academy);

  const availableCards = available.map(({ w }) => {
    const academy = app.academies[w.layoutId];
    const progress = app.progress(w.layoutId);
    const done = academy.study.chapters.filter((c) => chapterState(progress, c) === 'done').length;
    return `<a class="track-card" href="#/pista/${w.layoutId}">
      <span class="thumb hero-thumb" data-map="${w.layoutId}" data-variant="hero"></span>
      <span class="grow">
        <span class="eyebrow live"><span class="dot"></span>Academy demo</span>
        <strong class="card-title">${esc(academy.circuit.name)}</strong>
        <span class="meta">${esc(academy.layout.name)} · ${done}/${academy.study.chapters.length} capitoli</span>
        ${chapterSegments(app, w.layoutId)}
      </span>
      <span class="chev">${icon.chevron}</span></a>`;
  }).join('');

  const otherRows = others.map(({ w, i }) => `<li class="week-row" aria-disabled="true">
      <span class="week-num"><small>Sett</small>${String(w.week).padStart(2, '0')}</span>
      <span class="grow"><strong>${esc(w.track)}</strong>
        <span class="meta">${esc(w.layout)} · ${weekRangeLabel(s, i)}${pos.current === i ? ' · questa settimana' : ''}</span></span>
      <span class="soon">Non ancora disponibile</span></li>`).join('');

  root.innerHTML = `
    <header class="page-head">
      <h1 class="display">Piste</h1>
      ${gearLink}
    </header>
    <div class="series-card">
      <span class="badge-icon">${icon.flag}</span>
      <span class="grow"><span class="eyebrow">${esc(s.season)}</span>
        <strong class="card-title">${esc(s.series)}</strong>
        <span class="meta">${esc(s.car)} · ${s.weeks.length} piste in calendario</span></span>
    </div>
    ${availableCards}
    <h3 class="section-label">Altre piste del calendario</h3>
    <ol class="weeks">${otherRows}</ol>
    <p class="legend">${esc(s.calendar.note)} Le Academy di queste piste non sono ancora pronte.</p>`;
  mountMaps(root, app);
}

// ---------- Pagina pista ----------

export function renderTrack(root, app, layoutId) {
  const s = app.season;
  const { week: w, index } = findWeekByLayout(s, layoutId);
  const academy = app.academies[layoutId];

  if (!academy) {
    root.innerHTML = `
      <header class="page-head"><a class="back-chip" href="#/piste">${icon.back}<span>Piste</span></a></header>
      <h1 class="display">${esc(w.track)}</h1>
      <p class="sub">${esc(w.layout)} · settimana ${w.week} · ${weekRangeLabel(s, index)}</p>
      <div class="card"><p><strong>Non ancora disponibile.</strong> L'Academy di questa pista è in preparazione.</p></div>
      <a class="btn" href="#/piste">Torna alle piste</a>`;
    return null;
  }

  const cta = studyCta(app, layoutId);
  const { action } = cta;
  const ready = action.sum.ready;
  const total = cta.total;

  root.innerHTML = `<div class="fit">
    <header class="page-head">
      <a class="back-chip" href="#/piste">${icon.back}<span>Piste</span></a>
      <span class="mono-chip">${esc(academy.car)}</span>
    </header>
    <div class="intro">
      <h1 class="display">${esc(academy.circuit.name)}</h1>
      <p class="sub">${esc(academy.layout.name)} · ${academy.layout.turns} curve · ${esc(academy.layout.lengthText)}</p>
      <div class="progress-line">${chapterSegments(app, layoutId)}<span class="mono small">${action.sum.done}/${total}</span></div>
    </div>
    <div class="map-card grow-card" data-map="${layoutId}"></div>
    <div class="next-card">
      ${action.chapter
        ? `<span class="eyebrow">${cta.where}${action.chapter.minutes ? ` · ${action.chapter.minutes} min` : ''}${action.kind === 'continue' ? ' · in corso' : ''}</span>
           <strong class="next-title">${esc(action.chapter.title)}</strong>`
        : `<span class="eyebrow">Studio</span><strong class="next-title">Hai completato i capitoli disponibili</strong>`}
      <a class="btn primary" href="${cta.href}">${cta.label}</a>
      <div class="link-row">
        <a href="#/pista/${layoutId}/studio">Tutti i capitoli ›</a>
        <a href="#/pista/${layoutId}/curve">Le ${academy.layout.turns} curve ›</a>
        <a href="#/shadow-lap">Shadow Lap ›</a>
      </div>
    </div>
    <p class="foot-note">Academy demo: ${ready} capitoli su ${total} pronti, esame non ancora disponibile. Mappa © OpenStreetMap. Non affiliato a iRacing.</p>
  </div>`;
  mountMaps(root, app);
  return null;
}

// ---------- Impostazioni ----------

export function renderSettings(root, app) {
  const theme = getTheme();
  const st = homeStats(app.state());
  const opt = (value, label) => `<label class="seg"><input type="radio" name="theme" value="${value}"${theme === value ? ' checked' : ''}><span>${label}</span></label>`;
  const back = app.backHash && app.backHash !== '#/impostazioni' ? app.backHash : '#/';
  root.innerHTML = `
    <header class="page-head"><a class="back-chip" href="${esc(back)}">${icon.back}<span>Indietro</span></a></header>
    <h1 class="display">Impostazioni</h1>
    <h3 class="section-label">Tema</h3>
    <div class="segmented" role="radiogroup" aria-label="Tema">${opt('auto', 'Automatico')}${opt('light', 'Chiaro')}${opt('dark', 'Scuro')}</div>
    <h3 class="section-label">Progressi</h3>
    <div class="card">
      <p><b>Salvati solo su questo dispositivo</b>, senza account: se cancelli i dati del sito o cambi telefono, li perdi.</p>
      <p class="meta">${st.chaptersDone} capitoli completati · ${st.laps} giri Shadow Lap</p>
      ${store.storageWritable() ? '' : '<p class="error">Questo browser non permette di salvare i dati (forse sei in navigazione privata): i progressi andranno persi alla chiusura.</p>'}
      <div id="reset-area"><button class="btn danger" id="btn-reset">Cancella i progressi</button></div>
    </div>
    <p class="foot-note">Track Academy · prototipo privato. Non affiliato a iRacing. Mappe © OpenStreetMap contributors (ODbL). Caratteri Archivo e JetBrains Mono (SIL OFL).</p>`;

  for (const input of root.querySelectorAll('input[name="theme"]')) {
    input.addEventListener('change', () => setTheme(input.value));
  }
  const area = root.querySelector('#reset-area');
  const askReset = () => {
    area.innerHTML = `<p class="error">Vuoi davvero cancellare tutti i progressi? Non si può annullare.</p>
      <div class="actions two"><button class="btn danger" id="btn-reset-yes">Sì, cancella</button><button class="btn" id="btn-reset-no">Annulla</button></div>`;
    area.querySelector('#btn-reset-yes').addEventListener('click', () => {
      store.reset();
      area.innerHTML = '<p class="hint">Progressi cancellati.</p>';
    });
    area.querySelector('#btn-reset-no').addEventListener('click', () => {
      area.innerHTML = '<button class="btn danger" id="btn-reset">Cancella i progressi</button>';
      area.querySelector('#btn-reset').addEventListener('click', askReset);
    });
  };
  area.querySelector('#btn-reset').addEventListener('click', askReset);
  return null;
}

