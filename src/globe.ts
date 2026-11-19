// The globe: land and state shapes on a canvas, mountain markers and region labels in an SVG layer on top.
// It works in levels. Overview: regions are the things you pick, mountains are faint dots. Region: that
// region's mountains light up and can be picked. Zooming back out steps down through the levels again.
import { geoOrthographic, geoPath, geoGraticule10, geoCentroid, geoDistance, geoContains } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import geoJson from './geo.json';
import { type Mountain, GROUPS, REGIONS, vert, statusWord, regionName } from './types';

type StateFeature = GeoJSON.Feature<GeoJSON.Geometry, { code: string; name: string; country: string }>;
const geo = geoJson as unknown as { land: GeoJSON.MultiPolygon; states: { features: StateFeature[] } };
const groupOfState = new Map(REGIONS.map(r => [r.code, r.group]));
const states = geo.states.features.map(f => ({ f, code: f.properties.code, group: groupOfState.get(f.properties.code) ?? null, at: geoCentroid(f) as [number, number] }));
const collection = (fs: StateFeature[]) => ({ type: 'FeatureCollection', features: fs }) as never;
const otherStates = collection(states.filter(s => !s.group).map(s => s.f));
const skiStates = collection(states.filter(s => s.group).map(s => s.f));
const statesOf = new Map(GROUPS.map(g => [g.id, collection(states.filter(s => s.group === g.id).map(s => s.f))]));
const graticule = geoGraticule10();
const sphere = { type: 'Sphere' } as never;
// Ski country we have not mapped yet: shown as roped-off markers when someone spins the globe that far.
const SOON: { name: string; at: [number, number] }[] = [
  { name: 'The Alps', at: [10.2, 46.6] }, { name: 'Pyrenees', at: [0.6, 42.7] }, { name: 'Scandinavia', at: [9.5, 61.2] },
  { name: 'Japan', at: [138.2, 36.7] }, { name: 'Hokkaido', at: [142.6, 43.2] }, { name: 'The Andes', at: [-70.3, -33.4] },
  { name: 'New Zealand', at: [169.0, -44.8] }, { name: 'Snowy Mountains', at: [148.4, -36.4] }, { name: 'Caucasus', at: [43.0, 43.2] },
];

const canvas = document.querySelector<HTMLCanvasElement>('#globe')!;
const ctx = canvas.getContext('2d')!;
const svg = select<SVGSVGElement, unknown>('#map');
const soonG = svg.append('g').attr('class', 'soon');
const calloutG = svg.append('g').attr('class', 'callouts');
const markG = svg.append('g').attr('class', 'marks');
const projection = geoOrthographic().clipAngle(90).precision(0.4);
const path = geoPath(projection, ctx);

const HOME: [number, number] = [-101, 47];
const K_MAX = 70;
type Callout = { id: string; name: string; open: number; total: number; at: [number, number]; label: [number, number]; left: boolean; width: number };
let mountains: Mountain[] = [];
let callouts: Callout[] = [];
let selected: Mountain | null = null;
let focusGroup: string | null = null;
let hoverGroup: string | null = null;
let hoverId: string | null = null;
let rot: [number, number] = [-HOME[0], -HOME[1]];
let k = 1.6, homeK = 1.3, focusK = 4;
let w = 0, h = 0, r0 = 1;
let lastT: ZoomTransform = zoomIdentity.scale(k);
let anim = 0, frame = 0;
let sized = false, far = false, lastPlace = '';
let onReady: (() => void) | null = null;
let insets = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
let cb = {
  pick: (_m: Mountain) => {}, region: (_g: string) => {}, background: () => {},
  /** The user zoomed across a level boundary by hand. */
  level: (_to: 'overview' | 'region' | 'enter', _group?: string) => {},
  hoverGroup: (_g: string | null) => {}, far: (_far: boolean, _place: string) => {},
};

const clampLat = (v: number) => Math.max(-88, Math.min(88, v));
const centre = (): [number, number] => [-rot[0], -rot[1]];
const free = () => { const i = insets(); return { cx: i.left + (w - i.left - i.right) / 2, cy: i.top + (h - i.top - i.bottom) / 2, fw: Math.max(120, w - i.left - i.right), fh: Math.max(120, h - i.top - i.bottom) }; };
/** Zoom level at which an angular radius (radians) fills the free part of the screen. */
const fitK = (radius: number) => { const f = free(); return 0.44 * Math.min(f.fw, f.fh) / (r0 * Math.sin(Math.min(1.4, Math.max(0.012, radius)))); };
const mountainK = () => fitK(0.035);
const nearestGroup = (maxRad: number) => { let best: string | null = null, bd = maxRad; for (const c of callouts) { const d = geoDistance(centre(), c.at); if (d < bd) { bd = d; best = c.id; } } return best; };

// Wheel and pinch zoom glide instead of jumping: the handler only sets where the view should end up
// (kGoal, rotGoal) and a per-frame ease carries the globe there. Dragging stays direct.
let kGoal = k, rotGoal: [number, number] = [...rot], glide = 0, glideAt = 0;
function glideStep(now: number) {
  const dt = Math.min(64, now - glideAt); glideAt = now;
  const fk = 1 - Math.exp(-dt / 110), fr = 1 - Math.exp(-dt / 300);
  k = Math.exp(Math.log(k) + (Math.log(kGoal) - Math.log(k)) * fk);
  const dLon = ((rotGoal[0] - rot[0] + 540) % 360) - 180, dLat = rotGoal[1] - rot[1];
  rot = [rot[0] + dLon * fr, rot[1] + dLat * fr];
  const done = Math.abs(Math.log(kGoal / k)) < 0.002 && Math.abs(dLon) < 0.03 && Math.abs(dLat) < 0.03;
  if (done) { k = kGoal; rot = [rot[0] + dLon, rotGoal[1]]; glide = 0; } else glide = requestAnimationFrame(glideStep);
  draw();
}
const startGlide = () => { if (!glide) { glideAt = performance.now(); glide = requestAnimationFrame(glideStep); } };
const stopGlide = () => { cancelAnimationFrame(glide); glide = 0; };

const zoomer = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, K_MAX]).on('zoom', ev => {
  const t: ZoomTransform = ev.transform;
  if (ev.sourceEvent) {
    cancelAnimationFrame(anim);
    if (Math.abs(t.k - lastT.k) > 1e-9) {
      const out = t.k < lastT.k;
      if (!glide) rotGoal = [...rot];
      kGoal = t.k;
      // Fixed axis: zooming out towards the full view always settles facing North America.
      if (out && kGoal < homeK * 1.6) rotGoal = [-HOME[0], -HOME[1]];
      // Stepping through levels by zooming (one fast fling can cross two boundaries, so these are checked in turn).
      if (out && selected && kGoal < mountainK() * 0.42) cb.level('region');
      if (out && focusGroup && !selected && kGoal < Math.min(Math.max(homeK * 1.25, focusK * 0.62), homeK * 2)) cb.level('overview');
      if (!out && !focusGroup && kGoal > homeK * 2.6) { const g = nearestGroup(0.5); if (g) { focusK = kGoal; cb.level('enter', g); } }
      startGlide();
    } else {
      const deg = 180 / Math.PI / (r0 * k);
      rot = [rot[0] + (t.x - lastT.x) * deg, clampLat(rot[1] - (t.y - lastT.y) * deg)];
      rotGoal = [...rot];
      schedule();
    }
  }
  lastT = t;
});
svg.call(zoomer).on('dblclick.zoom', null);
const syncZoom = () => { kGoal = k; rotGoal = [...rot]; lastT = zoomIdentity.translate(lastT.x, lastT.y).scale(k); svg.property('__zoom', lastT); };

/** Which region is under a screen point (overview only). */
function groupAt(ev: MouseEvent): string | null {
  const r = svg.node()!.getBoundingClientRect();
  const p = projection.invert?.([ev.clientX - r.left, ev.clientY - r.top]) as [number, number] | null | undefined;
  if (!p || geoDistance(centre(), p) > Math.PI / 2) return null;
  for (const s of states) if (s.group && geoContains(s.f, p)) return s.group;
  return null;
}
const setHover = (g: string | null) => { if (g === hoverGroup) return; hoverGroup = g; svg.classed('pointing', !!g); cb.hoverGroup(g); schedule(); };
svg.on('mousemove', ev => { if (!focusGroup && !selected && ev.buttons === 0 && ev.target === svg.node()) setHover(groupAt(ev)); });
svg.on('mouseleave', () => { if (!focusGroup) setHover(null); });
svg.on('click', ev => {
  if (ev.target !== svg.node()) return;
  const g = !focusGroup && !selected ? groupAt(ev) : null;
  if (g) cb.region(g); else cb.background();
});

function schedule() { if (sized && !frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }

/** Triangle size follows vertical drop on a square-root curve: a 4,000 ft mountain is about twice a 300 ft hill, never huge. */
const markerSize = (m: Mountain) => 5 + 6.5 * Math.sqrt(Math.min(Math.max(vert(m), 0), 4400) / 4400);
/** How big markers are drawn at the current zoom: small from far away, full glyphs up close. */
const markerScale = () => Math.max(0.46, Math.min(w < 600 ? 0.8 : 1.05, 0.34 + k * 0.045));
const lit = (m: Mountain) => selected?.id === m.id || (!!focusGroup && m.group === focusGroup);

// The globe's centre on screen eases to its new spot when a panel opens or closes, instead of jumping.
let ccx = NaN, ccy = NaN;
function draw() {
  const f = free();
  if (Number.isNaN(ccx) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { ccx = f.cx; ccy = f.cy; }
  else if (Math.abs(f.cx - ccx) > 0.5 || Math.abs(f.cy - ccy) > 0.5) { ccx += (f.cx - ccx) * 0.14; ccy += (f.cy - ccy) * 0.14; schedule(); }
  else { ccx = f.cx; ccy = f.cy; }
  f.cx = ccx; f.cy = ccy;
  projection.scale(r0 * k).translate([f.cx, f.cy]).rotate([rot[0], rot[1]]);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = r0 * k;
  const glow = ctx.createRadialGradient(f.cx, f.cy, R * 0.96, f.cx, f.cy, R * 1.12);
  glow.addColorStop(0, 'rgba(96,165,255,.35)'); glow.addColorStop(1, 'rgba(96,165,255,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.cx, f.cy, R * 1.12, 0, 2 * Math.PI); ctx.fill();
  const sea = ctx.createRadialGradient(f.cx - R * 0.3, f.cy - R * 0.35, R * 0.1, f.cx, f.cy, R);
  sea.addColorStop(0, '#1b4a8c'); sea.addColorStop(1, '#0c2550');
  ctx.fillStyle = sea; ctx.beginPath(); path(sphere); ctx.fill();
  ctx.strokeStyle = 'rgba(160,195,245,.10)'; ctx.lineWidth = 0.6; ctx.beginPath(); path(graticule); ctx.stroke();
  ctx.lineJoin = 'round';
  // the rest of the world, then states without ski regions, then ski country a step brighter
  ctx.fillStyle = '#24467a'; ctx.beginPath(); path(geo.land as never); ctx.fill();
  ctx.strokeStyle = 'rgba(190,215,250,.28)'; ctx.lineWidth = 0.6;
  ctx.fillStyle = '#2a4f88'; ctx.beginPath(); path(otherStates); ctx.fill(); ctx.stroke();
  ctx.fillStyle = focusGroup ? '#2f5894' : '#37639f'; ctx.strokeStyle = 'rgba(190,215,250,.42)'; ctx.lineWidth = k > 6 ? 1 : 0.6;
  ctx.beginPath(); path(skiStates); ctx.fill(); ctx.stroke();
  // the region you are in, or the one under the pointer, lifts off the map
  const hot = focusGroup ?? hoverGroup;
  if (hot && statesOf.has(hot)) {
    ctx.fillStyle = focusGroup ? '#3f70b6' : '#4f86d4'; ctx.strokeStyle = focusGroup ? 'rgba(215,232,255,.6)' : 'rgba(255,255,255,.9)'; ctx.lineWidth = focusGroup ? 1 : 1.2;
    ctx.beginPath(); path(statesOf.get(hot)!); ctx.fill(); ctx.stroke();
  }
  if (k >= homeK * 1.7) {
    const c = centre();
    ctx.fillStyle = `rgba(205,225,255,${k > 14 ? 0.16 : 0.32})`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.min(34, 10 + k * 1.4)}px "Barlow Condensed", ui-sans-serif, system-ui, sans-serif`;
    for (const s of states) { if (geoDistance(c, s.at) > 1.2) continue; const p = projection(s.at); if (p) ctx.fillText(s.code, p[0], p[1]); }
  }
  placeMarkers();
  placeCallouts();
  placeSoon();
}

function placeMarkers() {
  const c = centre();
  const fs = markerScale();
  const pos = new Map<string, [number, number]>();
  for (const m of mountains) {
    if (geoDistance(c, [m.lon, m.lat]) > Math.PI / 2 - 0.02) continue;
    const p = projection([m.lon, m.lat]);
    if (p && p[0] > -40 && p[0] < w + 40 && p[1] > -40 && p[1] < h + 40) pos.set(m.id, p);
  }
  // Labels only for lit mountains: the selected one, then open ones, then the biggest, a few more with every step of zoom.
  const placed: [number, number, number, number][] = [];
  const labelled = new Set<string>();
  const rank = (m: Mountain) => (selected?.id === m.id || hoverId === m.id ? 0 : m.season.status === 'open' ? 1 : 2);
  const cand = mountains.filter(m => pos.has(m.id) && lit(m)).sort((a, b) => rank(a) - rank(b) || vert(b) - vert(a));
  const cap = Math.round(9 * Math.pow(Math.max(1, k / focusK), 2));
  let extra = 0;
  for (const m of cand) {
    const open = m.season.status === 'open', must = rank(m) === 0;
    if (!must && !open && extra >= cap) continue;
    const [x, y0] = pos.get(m.id)!;
    const y = y0 + markerSize(m) * 0.72 * fs * (open ? 1.25 : 1) + 11;
    const hw = m.name.length * 3.6 + 5;
    const box: [number, number, number, number] = [x - hw, y - 8, x + hw, y + 7];
    if (!must && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box); labelled.add(m.id);
    if (!open && !must) extra++;
  }
  markG.selectAll<SVGGElement, Mountain>('g.m').each(function (d) {
    const p = pos.get(d.id), g = select(this);
    if (!p) { g.attr('display', 'none'); return; }
    const on = lit(d), open = d.season.status === 'open', big = on && open ? 1.25 : 1;
    g.attr('display', null).attr('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`)
      .attr('class', `m s-${d.season.status}${on ? ' lit' : ' faint'}${selected?.id === d.id ? ' sel' : ''}${hoverId === d.id ? ' hov' : ''}`)
      .attr('tabindex', on ? 0 : null).attr('aria-hidden', on ? null : 'true');
    g.select('.in').attr('transform', `scale(${(fs * big * (on ? 1 : 0.62)).toFixed(3)})`);
    g.select('.lbl').attr('display', labelled.has(d.id) ? null : 'none').attr('y', markerSize(d) * 0.72 * fs * big + 14);
  });
}

function bindMarkers() {
  const sel = markG.selectAll<SVGGElement, Mountain>('g.m').data(mountains, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'm').attr('role', 'button');
    g.append('circle').attr('class', 'pulse').attr('r', 9);
    const inner = g.append('g').attr('class', 'in');
    inner.append('path').attr('class', 'tri');
    inner.append('path').attr('class', 'cap');
    g.append('text').attr('class', 'lbl').attr('text-anchor', 'middle');
    g.append('title');
    g.on('click', (ev, d) => { ev.stopPropagation(); cb.pick(d); })
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cb.pick(d); } });
    return g;
  });
  sel.sort((a, b) => Number(a.season.status === 'open') - Number(b.season.status === 'open') || markerSize(b) - markerSize(a));
  sel.attr('aria-label', d => `${d.name}, ${regionName(d.state)}, ${statusWord(d)}`);
  sel.select('title').text(d => `${d.name}, ${statusWord(d).toLowerCase()}`);
  sel.select<SVGPathElement>('.tri').attr('d', d => { const s = markerSize(d); return `M0,${-s}L${s * 0.92},${s * 0.72}L${-s * 0.92},${s * 0.72}Z`; });
  sel.select<SVGPathElement>('.cap').attr('d', d => { const s = markerSize(d); const y = -s + s * 0.62; const x = s * 0.33; return `M0,${-s}L${x},${y}L${x * 0.45},${y - s * 0.16}L0,${y + s * 0.06}L${-x * 0.45},${y - s * 0.16}L${-x},${y}Z`; });
  sel.select<SVGTextElement>('.lbl').text(d => d.name);
}

/** Region names pinned beside the globe with a leader line to the region. Overview only. */
function placeCallouts() {
  const c = centre();
  // only while the globe is facing North America: spun sideways, the labels would pile up on the limb
  const show = !focusGroup && !selected && w >= 700 && k < homeK * 2.6 && geoDistance(c, HOME) < 0.42;
  calloutG.attr('display', show ? null : 'none');
  if (!show) return;
  calloutG.selectAll<SVGGElement, Callout>('g.callout').each(function (d) {
    const g = select(this);
    if (geoDistance(c, d.label) > 1.45 || geoDistance(c, d.at) > 1.45) { g.attr('display', 'none'); return; }
    const a = projection(d.at)!, p = projection(d.label)!;
    if (!d.width) d.width = Math.max(...g.selectAll<SVGTextElement, unknown>('text').nodes().map(n => n.getComputedTextLength())) || 140;
    const wdt = d.width, left = d.left;
    // keep the whole label on screen: slide it back in rather than letting it run off the edge
    const edge = insets().left + 20;
    p[0] = left ? Math.max(p[0], edge + wdt + 14) : Math.min(p[0], w - wdt - 22);
    const len = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1, ux = (p[0] - a[0]) / len, uy = (p[1] - a[1]) / len;
    g.attr('display', null).classed('hot', hoverGroup === d.id);
    g.select('line').attr('x1', a[0] + ux * 14).attr('y1', a[1] + uy * 14).attr('x2', p[0] - ux * 6).attr('y2', p[1] - uy * 6);
    g.select('circle').attr('cx', a[0] + ux * 14).attr('cy', a[1] + uy * 14);
    g.select('.txt').attr('transform', `translate(${(p[0] + (left ? -4 : 4)).toFixed(1)},${p[1].toFixed(1)})`);
    g.selectAll('text').attr('text-anchor', left ? 'end' : 'start');
    g.select('rect').attr('x', left ? -wdt - 8 : -8).attr('y', -26).attr('width', wdt + 16).attr('height', 54);
  });
}

function bindCallouts() {
  callouts = GROUPS.map(g => {
    const ms = mountains.filter(m => m.group === g.id);
    let x = 0, y = 0, z = 0;
    for (const m of ms) { const la = m.lat * Math.PI / 180, lo = m.lon * Math.PI / 180; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); }
    return { id: g.id, name: g.name, open: ms.filter(m => m.season.status === 'open').length, total: ms.length, label: g.label, left: g.side === 'left', width: 0,
      at: [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI] as [number, number] };
  }).filter(c => c.total);
  const sel = calloutG.selectAll<SVGGElement, Callout>('g.callout').data(callouts, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'callout').attr('tabindex', 0).attr('role', 'button');
    g.append('line'); g.append('circle').attr('r', 3);
    const t = g.append('g').attr('class', 'txt');
    t.append('rect').attr('rx', 8);
    t.append('text').attr('class', 'cname');
    t.append('text').attr('class', 'ccount').attr('y', 19);
    g.on('click', (ev, d) => { ev.stopPropagation(); cb.region(d.id); })
      .on('mouseenter', (_ev, d) => setHover(d.id))
      .on('focus', (_ev, d) => setHover(d.id))
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); cb.region(d.id); } });
    return g;
  });
  sel.attr('aria-label', d => `${d.name}: ${d.open} of ${d.total} mountains open. Show this region.`).classed('has-open', d => d.open > 0);
  sel.select('.cname').text(d => d.name);
  sel.select('.ccount').text(d => (d.open ? `${d.open} open of ${d.total}` : `${d.total} mountains, none open yet`));
}

/** Roped-off markers for ski country we have not mapped, and a signal to the page when the view has left North America. */
function placeSoon() {
  const c = centre();
  const nowFar = geoDistance(c, HOME) > 1.0;
  let nearest = SOON[0], nd = 9;
  soonG.selectAll<SVGGElement, typeof SOON[number]>('g.soonpin').data(SOON, d => d.name).join(enter => {
    const g = enter.append('g').attr('class', 'soonpin');
    g.append('path').attr('d', 'M0,-9L8.3,6.5L-8.3,6.5Z');
    g.append('text').attr('class', 'sname').attr('y', 21).attr('text-anchor', 'middle').text(d => d.name);
    g.append('text').attr('class', 'stag').attr('y', 34).attr('text-anchor', 'middle').text('coming soon');
    return g;
  }).each(function (d) {
    const dist = geoDistance(c, d.at), p = projection(d.at);
    if (dist < nd) { nd = dist; nearest = d; }
    select(this).attr('display', nowFar && dist < 1.25 && p ? null : 'none').attr('transform', p ? `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})` : null);
  });
  if (nowFar !== far || (nowFar && nearest.name !== lastPlace)) { far = nowFar; lastPlace = nearest.name; cb.far(far, nearest.name); }
}

/** Animate the globe to look at a point at a zoom level. Long trips pull back a little on the way. */
function flyTo(target: [number, number], toK: number, ms = 1300) {
  cancelAnimationFrame(anim); stopGlide();
  toK = Math.max(homeK, Math.min(K_MAX, toK));
  const from = [...rot] as [number, number], fromK = k;
  const to: [number, number] = [-target[0], clampLat(-target[1])];
  const dLon = ((to[0] - from[0] + 540) % 360) - 180, dLat = to[1] - from[1];
  const hop = Math.min(0.5, Math.hypot(dLon, dLat) / 110);
  if (!ms || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { rot = to; k = toK; syncZoom(); draw(); return; }
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    rot = [from[0] + dLon * e, from[1] + dLat * e];
    k = Math.max(homeK, Math.exp(Math.log(fromK) + (Math.log(toK) - Math.log(fromK)) * e) * (1 - hop * Math.sin(Math.PI * t)));
    syncZoom(); draw();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

export const globe = {
  init(opts: { insets: typeof insets } & Partial<typeof cb>) {
    const { insets: i, ...rest } = opts;
    insets = i; cb = { ...cb, ...rest };
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
    this.refit();
    // The first time the page has a real size, frame North America; after that keep the user's view.
    if (!sized) { sized = true; onReady ? onReady() : this.home(0); } else draw();
  },
  /** The free area changed (a panel opened or closed): the furthest zoom-out is the view that frames North America. */
  refit() { homeK = fitK(0.62); zoomer.scaleExtent([homeK, K_MAX]); if (kGoal < homeK) kGoal = homeK; if (k < homeK && !glide) { k = homeK; syncZoom(); } },
  /** Run once the globe has a size (the page may load in a hidden tab). */
  whenReady(fn: () => void) { if (sized) fn(); else onReady = fn; },
  setMountains(ms: Mountain[]) { mountains = ms; bindMarkers(); bindCallouts(); schedule(); document.fonts?.ready.then(() => { for (const c of callouts) c.width = 0; schedule(); }); },
  setSelected(m: Mountain | null) { selected = m; schedule(); },
  setFocus(group: string | null) { focusGroup = group; if (group) { hoverGroup = null; svg.classed('pointing', false); } schedule(); },
  /** Highlight a region (from the menu) or a mountain (from the list) without moving the globe. */
  hoverRegion(group: string | null) { if (!focusGroup) { hoverGroup = group; schedule(); } },
  hoverMountain(id: string | null) { hoverId = id; schedule(); },
  redraw() { this.refit(); schedule(); },
  home(ms = 1200) { this.refit(); flyTo(HOME, homeK, ms); },
  toMountain(m: Mountain, ms = 1400) { this.refit(); flyTo([m.lon, m.lat], mountainK(), ms); },
  /** Frame a set of mountains (a region). */
  toMountains(ms: Mountain[], dur = 1400) {
    if (!ms.length) return;
    this.refit();
    let x = 0, y = 0, z = 0;
    for (const m of ms) { const la = m.lat * Math.PI / 180, lo = m.lon * Math.PI / 180; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la); }
    const c: [number, number] = [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI];
    const radius = Math.max(...ms.map(m => geoDistance(c, [m.lon, m.lat])));
    focusK = Math.max(homeK * 1.35, fitK(radius * 1.08 + 0.01));
    flyTo(c, focusK, dur);
  },
};
