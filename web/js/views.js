// Views: Home, campionato, pagina pista, impostazioni.

import { seasonPosition, weekRangeLabel, findWeekByLayout } from './season.js';
import {
  studySummary, shadowSummary, trackStatus, continueTarget, homeStats, hasAnyProgress,
} from './progress.js';
import { renderTrackMap } from './trackmap.js';
import { getTheme, setTheme } from './theme.js';
import * as store from './store.js';
import { esc, icon, relativeDay, MODE_LABEL } from './ui.js';

const STATUS = {
  not_started: { mark: '–', label: 'Non iniziata' },
  in_progress: { mark: '◐', label: 'In corso' },
  passed: { mark: '✓', label: 'Superata' },
};

function mountMaps(root, app) {
  for (const el of root.querySelectorAll('[data-map]')) {
    const ref = app.refs[el.dataset.map];
    if (ref) renderTrackMap(el, ref, { labels: el.dataset.labels === 'true' });
  }
}

function weekTag(app, index) {
  const pos = seasonPosition(app.season, app.now());
  if (pos.current === index) return 'Questa settimana';
  if (pos.next === index) return 'Prossima';
  return null;
}

function statusOf(app, week) {
  return week.academy ? trackStatus(app.progress(week.layoutId)) : null;
}

function seriesCard(app) {
  const s = app.season;
  return `<a class="card link-card series-card" href="#/campionato">
    <span class="badge-icon">${icon.flag}</span>
    <span class="grow"><span class="eyebrow">Campionato · ${esc(s.season)}</span>
      <strong class="card-title">${esc(s.series)}</strong>
      <span class="meta">${esc(s.car)} · ${s.weeks.length} settimane</span></span>
    <span class="chev">${icon.chevron}</span></a>`;
}

// Hero card for a week: full Academy, or an honest "in preparazione".
function weekHero(app, index, { cta }) {
  const s = app.season;
  const w = s.weeks[index];
  const pos = seasonPosition(s, app.now());
  const label = pos.phase === 'before' && index === 0 ? 'Prima settimana'
    : pos.phase === 'after' ? 'Ultima settimana' : 'Questa settimana';
  const head = `<div class="eyebrow live"><span class="dot"></span>${label} · Sett. ${w.week}/${s.weeks.length} · ${weekRangeLabel(s, index)}</div>
    <h2 class="display">${esc(w.track)}</h2>
    <div class="meta mono">${esc(w.layout)} · ${esc(s.car)}</div>`;
  if (w.academy) {
    const academy = app.academies[w.layoutId];
    return `<div class="card hero accent-border">${head}
      <a class="map-box" href="#/pista/${w.layoutId}" data-map="${w.layoutId}" aria-label="Apri ${esc(academy.circuit.name)}"></a>
      <a class="btn primary" href="#/pista/${w.layoutId}">${cta}</a></div>`;
  }
  return `<div class="card hero">${head}
    <p class="notice">Academy in preparazione: studio, quiz e Shadow Lap di questa pista non sono ancora disponibili.</p>
    <a class="btn" href="#/pista/${w.layoutId}">Apri la settimana</a></div>`;
}

function availableCards(app, excludeIndex, { firstVisit }) {
  const s = app.season;
  const items = s.weeks.map((w, i) => ({ w, i })).filter(({ w, i }) => w.academy && i !== excludeIndex);
  if (!items.length) return '';
  return `<h3 class="section-label">Già disponibile</h3>` + items.map(({ w, i }) => {
    const academy = app.academies[w.layoutId];
    const st = STATUS[statusOf(app, w)];
    return `<a class="card link-card academy-card" href="#/pista/${w.layoutId}">
      <span class="thumb" data-map="${w.layoutId}"></span>
      <span class="grow"><span class="eyebrow">Sett. ${w.week} · ${weekRangeLabel(s, i)}</span>
        <strong class="card-title">${esc(academy.circuit.name)}</strong>
        <span class="meta">${esc(academy.layout.name)} · Academy pilota · ${st.label.toLowerCase()}</span></span>
      <span class="chev">${firstVisit ? '' : icon.chevron}</span></a>
      ${firstVisit ? `<a class="btn primary" href="#/pista/${w.layoutId}">Prepara ${esc(academy.circuit.name)}</a>` : ''}`;
  }).join('');
}

function activityRows(app, state) {
  const completed = new Set(state.activity.filter((a) => a.type === 'chapter_completed').map((a) => `${a.academy}/${a.chapter}`));
  const rows = [...state.activity].reverse()
    .filter((a) => !(a.type === 'chapter_started' && completed.has(`${a.academy}/${a.chapter}`)))
    .slice(0, 5)
    .map((a) => {
      const academy = app.byKey[a.academy];
      if (!academy) return '';
      const when = `${esc(academy.circuit.name)} · ${relativeDay(a.at, app.now())}`;
      if (a.type === 'shadow_lap') {
        return `<li><span class="badge-icon">${icon.wheel}</span><span class="grow"><strong>Shadow Lap · ${MODE_LABEL[a.mode] ?? a.mode}</strong><span class="meta">${when}</span></span><span class="value">${a.score}<small>/100</small></span></li>`;
      }
      const chapter = academy.study.chapters.find((c) => c.id === a.chapter);
      const title = chapter ? esc(chapter.title) : 'capitolo';
      const done = a.type === 'chapter_completed';
      return `<li><span class="badge-icon">${icon.study}</span><span class="grow"><strong>Studio · ${title}</strong><span class="meta">${when}${done ? '' : ' · iniziato'}</span></span><span class="value ok">${done ? icon.check : ''}</span></li>`;
    }).join('');
  return rows ? `<h3 class="section-label">Ultime attività</h3><ul class="card list">${rows}</ul>` : '';
}

// ---------- Home ----------

export function renderHome(root, app) {
  const s = app.season;
  const state = app.state();
  const pos = seasonPosition(s, app.now());
  const heroIndex = pos.current ?? (pos.phase === 'before' ? 0 : s.weeks.length - 1);
  const returning = hasAnyProgress(state);
  let html = `<header class="brand"><span class="mark"></span>Track Academy</header>`;

  if (!returning) {
    html += `<h1 class="display xl">Conosci la pista prima di guidarla</h1>
      <p class="sub">Studia il tracciato, poi mettiti alla prova con quiz e Shadow Lap.</p>
      ${weekHero(app, heroIndex, { cta: 'Prepara questa pista' })}
      ${availableCards(app, heroIndex, { firstVisit: true })}
      <h3 class="section-label">Come funziona</h3>
      <ol class="steps">
        <li><b>1</b><span>Studio<small>Capitoli brevi sulla pista</small></span></li>
        <li><b>2</b><span>Quiz teorico<small>In arrivo</small></span></li>
        <li><b>3</b><span>Shadow Lap<small>Il giro a memoria, col telefono come volante</small></span></li>
      </ol>
      <p class="hint">Ordine consigliato, non obbligatorio.</p>
      ${seriesCard(app)}
      <p class="foot">I progressi restano salvati solo su questo dispositivo.</p>`;
  } else {
    const cont = continueTarget(state, app.byKey);
    if (cont) {
      const layoutId = cont.academy.id;
      const chapters = cont.academy.study.chapters;
      const n = chapters.findIndex((c) => c.id === cont.chapter.id) + 1;
      html += `<h3 class="section-label">Continua</h3>
        <div class="card hero accent-border">
          <div class="eyebrow">${esc(cont.academy.circuit.name)} · Studio · capitolo ${n}/${chapters.length}</div>
          <h2 class="display">${esc(cont.chapter.title)}</h2>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(cont.position * 100)}"><span style="width:${Math.max(4, cont.position * 100)}%"></span></div>
          <a class="btn primary" href="#/pista/${layoutId}/studio/${cont.chapter.id}">Continua la lezione</a>
        </div>`;
    }
    html += weekHero(app, heroIndex, { cta: 'Apri la pista' });
    html += availableCards(app, heroIndex, { firstVisit: false });
    html += activityRows(app, state);
    const st = homeStats(state);
    html += `<h3 class="section-label">Su questo dispositivo</h3>
      <div class="stats">
        <div><strong>${st.tracksStarted}<small>/${s.weeks.length}</small></strong><span>Piste iniziate</span></div>
        <div><strong>${st.chaptersDone}</strong><span>Capitoli completati</span></div>
        <div><strong>${st.laps}</strong><span>Giri Shadow Lap</span></div>
      </div>
      ${seriesCard(app)}`;
  }
  root.innerHTML = html;
  mountMaps(root, app);
}

// ---------- Campionato ----------

export function renderChampionship(root, app) {
  const s = app.season;
  const started = s.weeks.filter((w) => statusOf(app, w) && statusOf(app, w) !== 'not_started').length;
  const rows = s.weeks.map((w, i) => {
    const tag = weekTag(app, i);
    const status = statusOf(app, w);
    const right = status
      ? `<span class="status-mark" title="${STATUS[status].label}" aria-label="${STATUS[status].label}">${STATUS[status].mark}</span>`
      : '<span class="chip">In preparazione</span>';
    return `<li><a class="week-row${tag === 'Questa settimana' ? ' current' : tag ? ' next' : ''}${w.academy ? '' : ' muted-row'}" href="#/pista/${w.layoutId}">
      <span class="week-num"><small>Sett</small>${String(w.week).padStart(2, '0')}</span>
      <span class="grow">${tag ? `<span class="eyebrow tag">${tag}</span>` : ''}
        <strong>${esc(w.track)}</strong>
        <span class="meta">${esc(w.layout)} · ${weekRangeLabel(s, i)}</span></span>
      ${right}</a></li>`;
  }).join('');

  root.innerHTML = `
    <header class="topbar"><a class="icon-btn" href="#/" aria-label="Home">${icon.back}</a><span class="eyebrow">Home</span></header>
    <div class="eyebrow">Campionato · ${esc(s.season)}</div>
    <h1 class="display xl">${esc(s.series)}</h1>
    <div class="meta mono">${esc(s.car)} · ${s.weeks.length} settimane</div>
    <p class="sub">${esc(s.description)}</p>
    ${s.calendar.status === 'preliminary' ? `<p class="notice">${esc(s.calendar.note)} Fonte: <a href="${esc(s.calendar.source.url)}" target="_blank" rel="noopener">${esc(s.calendar.source.title)}</a>.</p>` : ''}
    <div class="row-between"><h3 class="section-label">Calendario · ${started}/${s.weeks.length} iniziate</h3></div>
    <ol class="weeks">${rows}</ol>
    <p class="legend">– non iniziata · ◐ in corso · ✓ superata. Puoi aprire qualsiasi settimana.</p>`;
}

// ---------- Pagina pista ----------

function trackHeader(app, layoutId, w, index) {
  const tag = weekTag(app, index);
  return `<header class="topbar"><a class="icon-btn" href="#/campionato" aria-label="Campionato">${icon.back}</a>
      <span class="eyebrow">Campionato</span>
      <span class="chip${tag === 'Questa settimana' ? ' live' : ''}">Sett. ${w.week} · ${tag ? tag.toLowerCase() : weekRangeLabel(app.season, index)}</span></header>`;
}

export function renderTrack(root, app, layoutId) {
  const s = app.season;
  const { week: w, index } = findWeekByLayout(s, layoutId);
  const academy = app.academies[layoutId];

  if (!academy) {
    root.innerHTML = `${trackHeader(app, layoutId, w, index)}
      <div class="eyebrow">${esc(s.car)} · F1600 Rookie</div>
      <h1 class="display xl">${esc(w.track)}</h1>
      <span class="layout-chip"><small>Layout</small>${esc(w.layout)}</span>
      <div class="card">
        <p><strong>Academy in preparazione.</strong> Studio, quiz e Shadow Lap di questa pista non sono ancora disponibili.</p>
        <p class="meta">Settimana ${w.week} · ${weekRangeLabel(s, index)}${w.layoutConfirmed ? '' : ' · il layout esatto va ancora confermato in iRacing'}.</p>
      </div>
      <a class="btn" href="#/campionato">Torna al campionato</a>`;
    return null;
  }

  const progress = app.progress(layoutId);
  const study = studySummary(progress, academy);
  const shadow = shadowSummary(progress);
  const total = academy.study.chapters.length;
  const nextIndex = study.next ? academy.study.chapters.indexOf(study.next) + 1 : null;
  let cta;
  if (!study.next && !study.started) cta = { label: 'Apri lo studio', href: `#/pista/${layoutId}/studio`, sub: 'Capitoli in preparazione' };
  else if (!study.started) cta ={ label: 'Comincia lo studio', href: `#/pista/${layoutId}/studio/${study.next.id}`, sub: `Capitolo ${nextIndex} · ${study.next.title}` };
  else if (study.next) cta = { label: 'Continua lo studio', href: `#/pista/${layoutId}/studio/${study.next.id}`, sub: `Capitolo ${nextIndex} · ${study.next.title}` };
  else cta = { label: 'Rivedi lo studio', href: `#/pista/${layoutId}/studio`, sub: 'Hai completato i capitoli disponibili' };

  const studyLine = study.started
    ? `${study.done}/${study.ready} capitoli completati${study.next ? ` · prossimo: ${esc(study.next.title)}` : ''}`
    : `${study.ready} capitoli disponibili · non iniziato`;
  let shadowLine = 'Non ancora provato';
  if (shadow) {
    const best = Object.entries(shadow.bestByMode).map(([m, v]) => `${MODE_LABEL[m] ?? m} ${v}`).join(' · ');
    shadowLine = `Ultimo ${shadow.last.score}/100 (${MODE_LABEL[shadow.last.mode] ?? shadow.last.mode}) · migliori: ${best}`;
  }

  root.innerHTML = `${trackHeader(app, layoutId, w, index)}
    <div class="eyebrow">${esc(academy.car)} · F1600 Rookie</div>
    <h1 class="display xl">${esc(academy.circuit.name)}</h1>
    <span class="layout-chip"><small>Layout</small>${esc(academy.layout.name)}</span>
    <div class="map-box large" data-map="${layoutId}"></div>
    <div class="meta mono map-caption">${academy.layout.turns} curve · senso ${esc(academy.layout.direction)} · ${esc(academy.layout.lengthText)} · geometria © OpenStreetMap</div>
    ${academy.status === 'pilot' ? `<p class="notice"><b>Academy pilota, in costruzione.</b> ${study.ready} capitoli dello Studio su ${total} sono pronti, il Quiz è in arrivo e il riferimento dello Shadow Lap è stimato.</p>` : ''}
    <h3 class="section-label">Il tuo stato · su questo dispositivo</h3>
    <ul class="card list activities">
      <li><a class="row-link" href="#/pista/${layoutId}/studio"><span class="badge-icon">${icon.study}</span>
        <span class="grow"><strong>Studio</strong><span class="meta">${studyLine}</span></span>
        <span class="value">${study.done}/${study.ready}</span></a></li>
      <li class="disabled"><span class="badge-icon">${icon.quiz}</span>
        <span class="grow"><strong>Quiz teorico</strong><span class="meta">In arrivo nella prossima versione</span></span>
        <span class="chip">In arrivo</span></li>
      <li><span class="badge-icon">${icon.wheel}</span>
        <span class="grow"><strong>Shadow Lap · prototipo</strong><span class="meta">Allenamento libero con le modalità dello spike. ${shadowLine}</span></span>
        <a class="btn small" href="#/pista/${layoutId}/shadow-lap">Avvia</a></li>
    </ul>
    <p class="hint">Consigliato: Studio → Quiz → Shadow Lap. Puoi iniziare da qualsiasi attività.</p>
    <a class="btn primary" href="${cta.href}">${cta.label}</a>
    <p class="cta-sub">${esc(cta.sub)}</p>
    <p class="foot">Non affiliato a iRacing. ${esc(academy.shadowLap.note)}</p>`;
  mountMaps(root, app);
  return null;
}

// ---------- Impostazioni ----------

export function renderSettings(root, app) {
  const theme = getTheme();
  const opt = (value, label) => `<label class="seg"><input type="radio" name="theme" value="${value}"${theme === value ? ' checked' : ''}><span>${label}</span></label>`;
  root.innerHTML = `
    <header class="brand"><span class="mark"></span>Track Academy</header>
    <h1 class="display xl">Impostazioni</h1>
    <h3 class="section-label">Aspetto</h3>
    <div class="segmented" role="radiogroup" aria-label="Tema">${opt('auto', 'Automatico')}${opt('light', 'Chiaro')}${opt('dark', 'Scuro')}</div>
    <p class="hint">Automatico segue il tema del telefono.</p>
    <h3 class="section-label">I tuoi dati</h3>
    <div class="card">
      <p>I progressi restano <b>solo in questo browser, su questo dispositivo</b>. Non ci sono account né sincronizzazione: se cancelli i dati del sito o cambi telefono, li perdi.</p>
      ${store.storageWritable() ? '' : '<p class="error">Questo browser non permette di salvare i dati (forse sei in navigazione privata): i progressi andranno persi alla chiusura.</p>'}
      <div id="reset-area"><button class="btn danger" id="btn-reset">Cancella i progressi</button></div>
    </div>
    <h3 class="section-label">Informazioni</h3>
    <div class="card small-print">
      <p>Track Academy · versione di prova privata.</p>
      <p>Non affiliato a iRacing. I nomi di piste, serie e auto servono solo a identificarle.</p>
      <p>Mappe dalla geometria © OpenStreetMap contributors, licenza ODbL. Caratteri Archivo e JetBrains Mono, licenza SIL OFL.</p>
    </div>`;

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
