// Track Academy app shell: data loading, hash router, tab bar.
//
// Tabs: Home · Piste · Shadow Lap. Impostazioni is a secondary page opened
// from the gear icon and returns to where it was opened from.
//
// Routes:
//   #/                               Home
//   #/piste                          serie e piste (#/campionato è un alias)
//   #/pista/<layoutId>               pagina pista (Academy o "non ancora disponibile")
//   #/pista/<layoutId>/studio        capitoli dello Studio
//   #/pista/<layoutId>/studio/<id>   lettura di un capitolo
//   #/pista/<layoutId>/curve         elenco curve e note personali
//   #/shadow-lap                     tab Shadow Lap (allenamento libero)
//   #/pista/<layoutId>/shadow-lap    alias: tab Shadow Lap su quella pista
//   #/impostazioni
//
// "?oggi=AAAA-MM-GG" in the URL overrides today's date, to check the
// current-week logic on any day of the season.

import * as store from './store.js';
import { initTheme } from './theme.js';
import { initShadowLap, openShadowSetup, abortShadowLap } from './shadowlap.js';
import { renderHome, renderPiste, renderTrack, renderSettings } from './views.js';
import { renderStudyIndex, renderChapter, renderCorners } from './study.js';

const SEASON_URL = 'data/seasons/f1600-rookie-2026s4.json';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let cleanup = null;

const app = {
  season: null,
  academies: {}, // by layoutId
  refs: {}, // Shadow Lap reference by layoutId
  byKey: {}, // academy by progress key
  now() {
    const override = new URLSearchParams(location.search).get('oggi');
    const ms = override ? Date.parse(`${override}T12:00:00Z`) : NaN;
    return Number.isNaN(ms) ? Date.now() : ms;
  },
  key(layoutId) {
    return store.academyKey(app.season.id, layoutId);
  },
  state() {
    return store.load(app.key('oulton-international'));
  },
  progress(layoutId) {
    return app.state().academies[app.key(layoutId)];
  },
  update(fn) {
    app.state(); // make sure stored progress is loaded (deep links skip the views)
    return store.update(fn);
  },
  go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  },
};

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${name}`;
  tabbar.hidden = !((name === 'view' && app.tabVisible) || name === 'setup');
  document.body.classList.toggle('with-tabbar', !tabbar.hidden);
  if (name === 'setup') setTab('shadow');
}
app.show = show;

function setTab(tab) {
  app.tabVisible = Boolean(tab);
  for (const a of tabbar.querySelectorAll('a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function openShadowTab() {
  const layoutId = app.academies[app.shadowLayout] ? app.shadowLayout : Object.keys(app.academies)[0];
  const academy = app.academies[layoutId];
  openShadowSetup({
    layoutId,
    ref: app.refs[layoutId],
    key: app.key(layoutId),
    title: `${academy.circuit.name} · ${academy.layout.name} · ${academy.car}`,
    refNote: academy.shadowLap.shortNote ?? academy.shadowLap.note,
  });
  window.scrollTo(0, 0);
}

function route() {
  cleanup?.();
  cleanup = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [section, layoutId, sub, item] = parts;

  if (section !== 'shadow-lap') abortShadowLap();
  if (section !== 'impostazioni') app.backHash = location.hash || '#/';

  // Old links keep working.
  if (section === 'campionato' && !layoutId) { location.replace('#/piste'); return; }
  if (section === 'pista' && sub === 'shadow-lap' && app.academies[layoutId]) {
    app.shadowLayout = layoutId;
    location.replace('#/shadow-lap');
    return;
  }
  if (section === 'shadow-lap' && !layoutId) { openShadowTab(); return; }

  let render = null;
  let tab = null;
  if (!section) { render = () => renderHome(view, app); tab = 'home'; }
  else if (section === 'piste' && !layoutId) { render = () => renderPiste(view, app); tab = 'piste'; }
  else if (section === 'impostazioni' && !layoutId) { render = () => renderSettings(view, app); }
  else if (section === 'pista' && app.season.weeks.some((w) => w.layoutId === layoutId)) {
    const academy = app.academies[layoutId];
    if (!sub) { render = () => renderTrack(view, app, layoutId); tab = 'piste'; }
    else if (academy && sub === 'studio' && !item) { render = () => renderStudyIndex(view, app, layoutId); tab = 'piste'; }
    else if (academy && sub === 'studio' && item) { render = () => renderChapter(view, app, layoutId, item); }
    else if (academy && sub === 'curve') { render = () => renderCorners(view, app, layoutId); tab = 'piste'; }
  }

  if (!render) { location.replace('#/'); return; }
  setTab(tab);
  show('view');
  window.scrollTo(0, 0);
  cleanup = render() || null;
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function boot() {
  initTheme();
  app.season = await loadJson(SEASON_URL);
  const withAcademy = app.season.weeks.filter((w) => w.academy);
  await Promise.all(withAcademy.map(async (w) => {
    const academy = await loadJson(`data/academies/${w.academy}.json`);
    app.academies[w.layoutId] = academy;
    app.byKey[app.key(w.layoutId)] = academy;
    app.refs[w.layoutId] = await loadJson(academy.shadowLap.reference);
  }));

  app.state(); // load and migrate stored progress once at startup

  initShadowLap({
    show,
    onExit: () => app.go('#/shadow-lap'),
    onAttempt: (ctx, attempt) => app.update((s) => store.addShadowAttempt(s, ctx.key, attempt)),
    getRotationFlip: () => app.state().prefs.rotationFlip,
    setRotationFlip: (v) => app.update((s) => ({ ...s, prefs: { ...s.prefs, rotationFlip: v } })),
  });

  window.addEventListener('hashchange', route);
  route();
}

boot().catch((e) => {
  view.innerHTML = `<div class="empty"><p class="error">Non è stato possibile caricare i dati dell'app.</p>
    <p class="hint">${String(e.message).replace(/[<>&]/g, '')}</p>
    <p class="hint">Controlla la connessione e ricarica la pagina.</p></div>`;
  show('view');
});
