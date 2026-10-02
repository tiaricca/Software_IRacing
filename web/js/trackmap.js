// SVG track map rendered from the reference path (finish-line order).

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function renderTrackMap(container, ref, { labels = true, onCornerClick } = {}) {
  const pts = ref.path;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 60;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;

  const svg = el('svg', { viewBox: `${minX} ${minY} ${w} ${h}`, class: 'trackmap', role: 'img' });
  svg.setAttribute('aria-label', `Mappa ${ref.track} ${ref.layout}`);
  const d = 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
  svg.append(el('path', { d, class: 'track-outline' }));
  svg.append(el('path', { d, class: 'track-surface' }));

  const [fx, fy] = pts[0];
  svg.append(el('circle', { cx: fx, cy: fy, r: 14, class: 'finish' }));

  const markers = new Map();
  for (const c of ref.corners) {
    const [x, y] = pts[c.pathIndex];
    const g = el('g', { class: `corner corner-${c.dir}${c.minor ? ' corner-minor' : ''}`, 'data-id': c.id });
    g.append(el('circle', { cx: x, cy: y, r: c.minor ? 16 : 22 }));
    if (labels) {
      const t = el('text', { x, y: y + 7, 'text-anchor': 'middle' });
      t.textContent = c.id.slice(1);
      g.append(t);
    }
    if (onCornerClick) g.addEventListener('click', () => onCornerClick(c.id));
    svg.append(g);
    markers.set(c.id, g);
  }

  const ghost = el('circle', { r: 18, class: 'ghost', visibility: 'hidden' });
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
