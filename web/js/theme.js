// Theme: 'auto' follows the system, 'light' / 'dark' are forced. The
// resolved theme is applied as data-theme on <html>; an inline script in
// index.html does the same before first paint to avoid a flash.

const media = window.matchMedia('(prefers-color-scheme: light)');
let preference = 'auto';

function apply() {
  const resolved = preference === 'auto' ? (media.matches ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#FFFFFF' : '#0E1013';
}

export function getTheme() {
  return preference;
}

export function initTheme() {
  try { preference = localStorage.getItem('ta-theme') || 'auto'; } catch { preference = 'auto'; }
  if (!['light', 'dark'].includes(preference)) preference = 'auto';
  apply();
}

export function setTheme(pref) {
  preference = ['light', 'dark'].includes(pref) ? pref : 'auto';
  try { localStorage.setItem('ta-theme', preference); } catch { /* storage unavailable */ }
  apply();
}

media.addEventListener('change', () => { if (preference === 'auto') apply(); });
