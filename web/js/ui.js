// Small UI helpers shared by the views.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
}

export const DIR = { L: { arrow: '←', label: 'Sinistra' }, R: { arrow: '→', label: 'Destra' } };
export const INTENSITY = { minor: 'piega', small: 'leggera', medium: 'media', large: 'forte' };
export const MODE_LABEL = { rookie: 'Rookie', driver: 'Driver', pro: 'Pro' };

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// "oggi", "ieri", "3 giorni fa", otherwise "12 ott"
export function relativeDay(iso, nowMs = Date.now()) {
  const d = new Date(iso);
  const day = (ms) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000);
  const diff = day(nowMs) - day(d.getTime());
  if (diff <= 0) return 'oggi';
  if (diff === 1) return 'ieri';
  if (diff < 7) return `${diff} giorni fa`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const icon = {
  back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  study: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6"/></svg>',
  quiz: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.6M8 12v.5"/></svg>',
  wheel: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 8v5.5"/></svg>',
  home: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5L8 3l5.5 4.5V13h-3.5V9.5h-4V13H2.5z"/></svg>',
  flag: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5h8l-1.5 3 1.5 3h-8"/></svg>',
  gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
};
