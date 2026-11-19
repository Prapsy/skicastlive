// The globe: land and state lines on a canvas, mountain markers in an SVG layer on top.
import { geoOrthographic, geoPath, geoGraticule10, geoCentroid, geoDistance } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import geoJson from './geo.json';
import { type Mountain, vert, statusWord, regionName } from './types';

const geo = geoJson as unknown as { land: GeoJSON.MultiPolygon; states: GeoJSON.FeatureCollection<GeoJSON.Geometry, { code: string; name: string; country: string }> };
const stateLabels = geo.states.features.map(f => ({ code: f.properties.code, at: geoCentroid(f) as [number, number] }));
const graticule = geoGraticule10();
const sphere: GeoJSON.GeoJsonObject = { type: 'Sphere' } as unknown as GeoJSON.GeoJsonObject;

const canvas = document.querySelector<HTMLCanvasElement>('#globe')!;
const ctx = canvas.getContext('2d')!;
const svg = select<SVGSVGElement, unknown>('#map');
const markG = svg.append('g').attr('class', 'marks');
const projection = geoOrthographic().clipAngle(90).precision(0.4);
const path = geoPath(projection, ctx);

const HOME: [number, number] = [-101, 47];
const K_MIN = 0.85, K_MAX = 70;
let mountains: Mountain[] = [];
let selected: Mountain | null = null;
let focusGroup: string | null = null;
let rot: [number, number] = [-HOME[0], -HOME[1]];
let k = 1.6;
let w = 0, h = 0, r0 = 1;
let lastT: ZoomTransform = zoomIdentity.scale(k);
let anim = 0;
let frame = 0;
let sized = false;
let onReady: (() => void) | null = null;
let insets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
let onPick: (m: Mountain) => void = () => {};
let onBackground: () => void = () => {};

const clampLat = (v: number) => Math.max(-88, Math.min(88, v));
const free = () => { const i = insets(); return { cx: i.left + (w - i.left - i.right) / 2, cy: i.top + (h - i.top - i.bottom) / 2, fw: Math.max(120, w - i.left - i.right), fh: Math.max(120, h - i.top - i.bottom) }; };

const zoomer = d3zoom<SVGSVGElement, unknown>().scaleExtent([K_MIN, K_MAX]).on('zoom', ev => {
  const t: ZoomTransform = ev.transform;
  if (ev.sourceEvent) {
    cancelAnimationFrame(anim);
    if (Math.abs(t.k - lastT.k) > 1e-9) k = t.k;
    else {
      const deg = 180 / Math.PI / (r0 * k);
      rot = [rot[0] + (t.x - lastT.x) * deg, clampLat(rot[1] - (t.y - lastT.y) * deg)];
    }
    schedule();
  }
  lastT = t;
});
svg.call(zoomer).on('dblclick.zoom', null);
svg.on('click', ev => { if (ev.target === svg.node()) onBackground(); });
const syncZoom = () => { lastT = zoomIdentity.translate(lastT.x, lastT.y).scale(k); svg.property('__zoom', lastT); };

function schedule() { if (sized && !frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }

const markerSize = (m: Mountain) => 6 + Math.min(9, vert(m) / 330);
/** How big markers are drawn at the current zoom: small dots from far away, full glyphs up close. */
const markerScale = () => Math.max(0.36, Math.min(w < 600 ? 0.72 : 1.1, 0.26 + k * 0.05));

function draw() {
  const f = free();
  projection.scale(r0 * k).translate([f.cx, f.cy]).rotate([rot[0], rot[1]]);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = r0 * k;
  // atmosphere + ocean
  const glow = ctx.createRadialGradient(f.cx, f.cy, R * 0.96, f.cx, f.cy, R * 1.12);
  glow.addColorStop(0, 'rgba(96,165,255,.35)'); glow.addColorStop(1, 'rgba(96,165,255,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.cx, f.cy, R * 1.12, 0, 2 * Math.PI); ctx.fill();
  const sea = ctx.createRadialGradient(f.cx - R * 0.3, f.cy - R * 0.35, R * 0.1, f.cx, f.cy, R);
  sea.addColorStop(0, '#1b4a8c'); sea.addColorStop(1, '#0c2550');
  ctx.fillStyle = sea; ctx.beginPath(); path(sphere as never); ctx.fill();
  ctx.strokeStyle = 'rgba(160,195,245,.10)'; ctx.lineWidth = 0.6; ctx.beginPath(); path(graticule); ctx.stroke();
  // rest of the world, then the US and Canada a touch brighter with their state / province lines
  ctx.fillStyle = '#24467a'; ctx.beginPath(); path(geo.land as never); ctx.fill();
  ctx.fillStyle = '#34609f'; ctx.strokeStyle = 'rgba(190,215,250,.42)'; ctx.lineWidth = k > 6 ? 1 : 0.6; ctx.lineJoin = 'round';
  ctx.beginPath(); path(geo.states as never); ctx.fill(); ctx.stroke();
  if (k >= 2.4) {
    const centre: [number, number] = [-rot[0], -rot[1]];
    ctx.fillStyle = `rgba(205,225,255,${k > 14 ? 0.16 : 0.34})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.min(30, 9 + k * 1.3)}px ui-sans-serif, system-ui, sans-serif`;
    for (const s of stateLabels) { if (geoDistance(centre, s.at) > 1.2) continue; const p = projection(s.at); if (p) ctx.fillText(s.code, p[0], p[1]); }
  }
  placeMarkers();
}

function placeMarkers() {
  const centre: [number, number] = [-rot[0], -rot[1]];
  const fs = markerScale();
  const pos = new Map<string, [number, number]>();
  for (const m of mountains) {
    if (geoDistance(centre, [m.lon, m.lat]) > Math.PI / 2 - 0.02) continue;
    const p = projection([m.lon, m.lat]);
    if (p && p[0] > -40 && p[0] < w + 40 && p[1] > -40 && p[1] < h + 40) pos.set(m.id, p);
  }
  // Greedy labels: the selected mountain, then open ones, then the biggest; skip any that would overlap.
  const placed: [number, number, number, number][] = [];
  const labelled = new Set<string>();
  const inFocus = (m: Mountain) => !focusGroup || m.group === focusGroup;
  const rank = (m: Mountain) => (selected?.id === m.id ? 0 : m.season.status === 'open' ? 1 : 2);
  const cand = mountains.filter(m => pos.has(m.id) && inFocus(m)).sort((a, b) => rank(a) - rank(b) || vert(b) - vert(a));
  for (const m of cand) {
    const v = vert(m), open = m.season.status === 'open';
    const want = selected?.id === m.id || (open && k >= 1.2) || k >= 26 || (v >= 2200 && k >= 7) || (v >= 1200 && k >= 13);
    if (!want) continue;
    const [x, y0] = pos.get(m.id)!;
    const y = y0 + markerSize(m) * 0.72 * fs * (open ? 1.25 : 1) + 11;
    const hw = m.name.length * 3.5 + 5;
    const box: [number, number, number, number] = [x - hw, y - 8, x + hw, y + 7];
    if (selected?.id !== m.id && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box); labelled.add(m.id);
  }
  markG.selectAll<SVGGElement, Mountain>('g.m').each(function (d) {
    const p = pos.get(d.id), g = select(this);
    if (!p) { g.attr('display', 'none'); return; }
    const open = d.season.status === 'open';
    g.attr('display', null).attr('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`)
      .attr('class', `m s-${d.season.status}${selected?.id === d.id ? ' sel' : ''}${inFocus(d) ? '' : ' out'}`);
    g.select('.in').attr('transform', `scale(${(fs * (open ? 1.25 : 1)).toFixed(3)})`);
    g.select('.lbl').attr('display', labelled.has(d.id) ? null : 'none').attr('y', markerSize(d) * 0.72 * fs * (open ? 1.25 : 1) + 14);
  });
}

function bindMarkers() {
  const sel = markG.selectAll<SVGGElement, Mountain>('g.m').data(mountains, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'm').attr('tabindex', 0).attr('role', 'button');
    g.append('circle').attr('class', 'pulse').attr('r', 9);
    const inner = g.append('g').attr('class', 'in');
    inner.append('path').attr('class', 'tri');
    inner.append('path').attr('class', 'cap');
    g.append('text').attr('class', 'lbl').attr('text-anchor', 'middle');
    g.append('title');
    g.on('click', (ev, d) => { ev.stopPropagation(); onPick(d); })
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(d); } });
    return g;
  });
  // closed first, open last, so open mountains sit on top; within each, big ones underneath
  sel.sort((a, b) => Number(a.season.status === 'open') - Number(b.season.status === 'open') || markerSize(b) - markerSize(a));
  sel.attr('aria-label', d => `${d.name}, ${regionName(d.state)}, ${statusWord(d)}`);
  sel.select('title').text(d => `${d.name} · ${statusWord(d)}`);
  sel.select<SVGPathElement>('.tri').attr('d', d => { const s = markerSize(d); return `M0,${-s}L${s * 0.92},${s * 0.72}L${-s * 0.92},${s * 0.72}Z`; });
  sel.select<SVGPathElement>('.cap').attr('d', d => { const s = markerSize(d); const y = -s + s * 0.62; const x = s * 0.33; return `M0,${-s}L${x},${y}L${x * 0.45},${y - s * 0.16}L0,${y + s * 0.06}L${-x * 0.45},${y - s * 0.16}L${-x},${y}Z`; });
  sel.select<SVGTextElement>('.lbl').text(d => d.name);
}

/** Animate the globe to look at a point at a zoom level. Long trips pull back a little on the way. */
function flyTo(target: [number, number], toK: number, ms = 1300) {
  cancelAnimationFrame(anim);
  toK = Math.max(K_MIN, Math.min(K_MAX, toK));
  const from = [...rot] as [number, number], fromK = k;
  const to: [number, number] = [-target[0], clampLat(-target[1])];
  let dLon = ((to[0] - from[0] + 540) % 360) - 180;
  const dLat = to[1] - from[1];
  const hop = Math.min(0.55, Math.hypot(dLon, dLat) / 110);
  if (!ms || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { rot = to; k = toK; syncZoom(); draw(); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    rot = [from[0] + dLon * e, from[1] + dLat * e];
    k = Math.exp(Math.log(fromK) + (Math.log(toK) - Math.log(fromK)) * e) * (1 - hop * Math.sin(Math.PI * t));
    k = Math.max(K_MIN, k);
    syncZoom(); draw();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

/** Zoom level at which an angular radius (radians) fills the free part of the screen. */
const fitK = (radius: number) => { const f = free(); return 0.44 * Math.min(f.fw, f.fh) / (r0 * Math.sin(Math.min(1.4, Math.max(0.012, radius)))); };

export const globe = {
  init(opts: { insets: typeof insets; onPick: typeof onPick; onBackground: typeof onBackground }) {
    insets = opts.insets; onPick = opts.onPick; onBackground = opts.onBackground;
    let t = 0;
    new ResizeObserver(() => { clearTimeout(t); t = window.setTimeout(() => this.resize(), sized ? 120 : 0); }).observe(canvas.parentElement!);
    this.resize();
  },
  resize() {
    const r = canvas.parentElement!.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height; r0 = Math.min(w, h) * 0.47;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    // The first time the page has a real size, frame North America; after that keep the user's view.
    if (!sized) { sized = true; onReady ? onReady() : this.home(0); } else draw();
  },
  /** Run once the globe has a size (the page may load in a hidden tab). */
  whenReady(fn: () => void) { if (sized) fn(); else onReady = fn; },
  setMountains(ms: Mountain[]) { mountains = ms; bindMarkers(); schedule(); },
  setSelected(m: Mountain | null) { selected = m; schedule(); },
  setFocus(group: string | null) { focusGroup = group; schedule(); },
  redraw: schedule,
  home(ms = 1200) { flyTo(HOME, fitK(0.62), ms); },
  toMountain(m: Mountain, ms = 1400) { flyTo([m.lon, m.lat], fitK(0.035), ms); },
  /** Frame a set of mountains (a region). */
  toMountains(ms: Mountain[], dur = 1400) {
    if (!ms.length) return;
    let x = 0, y = 0, z = 0;
    for (const m of ms) { const la = m.lat * Math.PI / 180, lo = m.lon * Math.PI / 180; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); }
    const c: [number, number] = [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
    const radius = Math.max(...ms.map(m => geoDistance(c, [m.lon, m.lat])));
    flyTo(c, fitK(radius * 1.08 + 0.01), dur);
  },
};
