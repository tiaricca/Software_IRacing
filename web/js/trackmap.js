// SVG track map rendered from the reference path (finish-line order).
//
// Options:
//   labels: true | false        show corner markers with their number
//   focus:  ['T13', 'T17']      highlight the stretch between two corners,
//                               zoom on it and only label its corners
//   onCornerClick(id)

const NS = 'http://www.w3.org/2000/svg';
const FOCUS_PAD = 45; // path points (~180 m) shown before/after a focus range

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function pathD(pts, closed) {
  return 'M' + pts.map((p) => p.join(',')).join('L') + (closed ? 'Z' : '');
}

export function focusRange(ref, focus) {
  const ids = ref.corners.map((c) => c.id);
  const a = ref.corners[ids.indexOf(focus[0])];
  const b = ref.corners[ids.indexOf(focus[focus.length - 1])];
  if (!a || !b) return null;
  return {
    from: Math.max(0, a.pathIndex - FOCUS_PAD),
    to: Math.min(ref.path.length - 1, b.pathIndex + FOCUS_PAD),
    corners: ref.corners.slice(ids.indexOf(a.id), ids.indexOf(b.id) + 1).map((c) => c.id),
  };
}

export function renderTrackMap(container, ref, { labels = true, focus = null, onCornerClick } = {}) {
  const pts = ref.path;
  const range = focus ? focusRange(ref, focus) : null;
  const box = range ? pts.slice(range.from, range.to + 1) : pts;
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 200);
  const pad = span * 0.12 + 30;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const k = Math.max(w, h) / 1120; // keeps strokes and markers the same size when zoomed

  const svg = el('svg', { viewBox: `${minX} ${minY} ${w} ${h}`, class: `trackmap${range ? ' trackmap-focus' : ''}`, role: 'img' });
  svg.setAttribute('aria-label', `Mappa ${ref.track} ${ref.layout}`);
  svg.style.setProperty('--k', k);
  const d = pathD(pts, true);
  svg.append(el('path', { d, class: 'track-outline', 'stroke-width': 26 * k }));
  svg.append(el('path', { d, class: 'track-surface', 'stroke-width': 14 * k }));
  if (range) {
    svg.append(el('path', { d: pathD(pts.slice(range.from, range.to + 1), false), class: 'track-highlight', 'stroke-width': 14 * k }));
  }

  const [fx, fy] = pts[0];
  svg.append(el('rect', { x: fx - 16 * k, y: fy - 6 * k, width: 32 * k, height: 12 * k, class: 'finish', 'stroke-width': 3 * k }));

  const markers = new Map();
  const shown = range ? new Set(range.corners) : null;
  if (labels) {
    for (const c of ref.corners) {
      if (shown && !shown.has(c.id)) continue;
      const [x, y] = pts[c.pathIndex];
      const g = el('g', { class: `corner corner-${c.dir}${c.minor ? ' corner-minor' : ''}`, 'data-id': c.id });
      g.append(el('circle', { cx: x, cy: y, r: (c.minor ? 24 : 28) * k, 'stroke-width': 4 * k }));
      const t = el('text', { x, y: y + 9 * k, 'text-anchor': 'middle', 'font-size': 26 * k });
      t.textContent = c.id.slice(1);
      g.append(t);
      if (onCornerClick) g.addEventListener('click', () => onCornerClick(c.id));
      svg.append(g);
      markers.set(c.id, g);
    }
  }

  const ghost = el('circle', { r: 18 * k, class: 'ghost', visibility: 'hidden', 'stroke-width': 6 * k });
  svg.append(ghost);

  container.replaceChildren(svg);

  return {
    highlight(id) {
      for (const [cid, g] of markers) g.classList.toggle('active', cid === id);
    },
    setGhost(t) {
      if (t == null) { ghost.setAttribute('visibility', 'hidden'); return; }
      const T = ref.pathT;
      let lo = 0;
      let hi = T.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (T[mid] <= t) lo = mid; else hi = mid - 1;
      }
      const [x, y] = pts[lo];
      ghost.setAttribute('cx', x);
      ghost.setAttribute('cy', y);
      ghost.setAttribute('visibility', 'visible');
    },
  };
}
