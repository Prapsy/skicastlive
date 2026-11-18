import './style.css';
import { geoMercator, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import statesJson from './states.json';

type LiftStatus = 'open' | 'closed' | 'hold' | 'scheduled';
interface Lift { name: string; status: LiftStatus; osmId?: number }
interface Day { date: string; snowIn: number; precipIn: number; hiF: number; loF: number; code: number; summary: string; windMph: number; gustMph: number }
interface Weather { elevationFt: number; today: string; updated?: string; now: { tempF: number; summary: string; windMph: number } | null; past72In: number; next24In: number; next72In: number; next7dIn: number; days: Day[] }
interface News { title: string; date?: string | null; excerpt?: string; url?: string }
interface Mountain {
  id: string; name: string; state: string; lat: number; lon: number; baseFt: number; summitFt: number; url: string;
  reportUrl: string; coverage: 'live' | 'link'; stale: boolean; sourceNote: string | null;
  lifts: { open: number; total: number; pct: number; list: Lift[] } | null;
  season: { status: 'open' | 'closed' | 'unknown'; openingDate: string | null; note: string | null };
  resortSnow?: { last24In: number | null; last48In: number | null; last7dIn: number | null; baseDepthIn: number | null; seasonIn: number | null; updated: string | null } | null;
  news: News[]; liftsUpdated: string | null; reportUpdated?: string | null; weather: Weather | null;
}
interface Snapshot { generatedAt: string; mountains: Mountain[] }
interface LiftGeo { features: { properties: { osmId: number; name: string | null; kind: string }; geometry: { coordinates: [number, number][] } }[] }

const STATE_NAMES: Record<string, string> = { VT: 'Vermont', NH: 'New Hampshire', ME: 'Maine', MA: 'Massachusetts', CT: 'Connecticut', RI: 'Rhode Island' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;
const inches = (n: number) => (n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')) + '″';
const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} hr ago`;
  return `${Math.round(min / 1440)} days ago`;
};
const dayName = (d: string, today: string) => d === today ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
const longDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const wxGlyph = (code: number) => code >= 95 ? '⚡' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? '❄' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? '☂' : code >= 45 ? '≋' : code >= 2 ? '☁' : '☀';

// ---------------------------------------------------------------- map
const svg = select<SVGSVGElement, unknown>('#map');
const root = svg.append('g');
const landG = root.append('g').attr('class', 'land');
const markG = root.append('g').attr('class', 'marks');
const projection = geoMercator();
const path = geoPath(projection);
const states = statesJson as unknown as GeoJSON.FeatureCollection;
let mountains: Mountain[] = [];
let selected: Mountain | null = null;
let k = 1;
let tf: ZoomTransform = zoomIdentity;
let openOnly = false;

const zoomer = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 60]).on('zoom', ev => {
  const t: ZoomTransform = ev.transform;
  k = t.k; tf = t;
  root.attr('transform', t.toString());
  restyle();
});
svg.call(zoomer).on('dblclick.zoom', null);
svg.on('click', ev => { if (ev.target === svg.node() || (ev.target as Element).classList.contains('state')) closePanel(); });

const isWide = () => window.innerWidth >= 860;
const size = () => { const r = svg.node()!.getBoundingClientRect(); return [r.width, r.height] as const; };
const markerSize = (m: Mountain) => 6 + Math.min(9, (m.summitFt - m.baseFt) / 330);

function layout() {
  const [w, h] = size();
  if (!w || !h) return;
  svg.attr('viewBox', `0 0 ${w} ${h}`);
  const pad = Math.min(w, h) * 0.05;
  projection.fitExtent([[pad, pad + 8], [w - pad, h - pad - 30]], states);
  landG.selectAll<SVGPathElement, GeoJSON.Feature>('path').data(states.features).join('path').attr('class', 'state').attr('d', path);
  landG.selectAll<SVGTextElement, GeoJSON.Feature>('text').data(states.features).join('text').attr('class', 'state-label')
    .attr('transform', f => `translate(${path.centroid(f)})`).text(f => (f.properties as { code: string }).code);
  zoomer.translateExtent([[-w * 0.4, -h * 0.4], [w * 1.4, h * 1.4]]);
  drawMarkers();
  if (selected) flyTo(selected, 0); else svg.call(zoomer.transform, zoomIdentity);
}

function drawMarkers() {
  const sel = markG.selectAll<SVGGElement, Mountain>('g.m').data(mountains, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'm').attr('tabindex', 0).attr('role', 'button');
    const inner = g.append('g').attr('class', 'in');
    inner.append('path').attr('class', 'tri');
    inner.append('path').attr('class', 'cap');
    inner.append('text').attr('class', 'lbl').attr('text-anchor', 'middle');
    g.append('title');
    g.on('click', (ev, d) => { ev.stopPropagation(); pick(d); })
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(d); } });
    return g;
  });
  // draw big mountains first so small ones stay clickable on top
  sel.sort((a, b) => markerSize(b) - markerSize(a));
  sel.attr('transform', d => `translate(${projection([d.lon, d.lat])})`)
    .attr('aria-label', d => `${d.name}, ${STATE_NAMES[d.state]}, ${statusWord(d)}`);
  sel.select('title').text(d => `${d.name} · ${statusWord(d)}`);
  sel.select<SVGPathElement>('.tri').attr('d', d => { const s = markerSize(d); return `M0,${-s}L${s * 0.92},${s * 0.72}L${-s * 0.92},${s * 0.72}Z`; });
  sel.select<SVGPathElement>('.cap').attr('d', d => { const s = markerSize(d); const y = -s + s * 0.62; const x = s * 0.33; return `M0,${-s}L${x},${y}L${x * 0.45},${y - s * 0.16}L0,${y + s * 0.06}L${-x * 0.45},${y - s * 0.16}L${-x},${y}Z`; });
  sel.select<SVGTextElement>('.lbl').attr('y', d => markerSize(d) * 0.72 + 12).text(d => d.name);
  restyle();
}

function restyle() {
  const inv = 1 / Math.pow(k, 0.86);
  const f = k * inv; // on-screen scale of a marker
  // Greedy label placement in screen space: selected first, then biggest mountains; skip labels that would collide.
  const placed: [number, number, number, number][] = [];
  const visible = new Set<string>();
  const cand = mountains.filter(d => !(openOnly && d.season.status !== 'open'))
    .sort((a, b) => Number(selected?.id === b.id) - Number(selected?.id === a.id) || (b.summitFt - b.baseFt) - (a.summitFt - a.baseFt));
  if (selected) { // keep other labels off the selected marker
    const p = projection([selected.lon, selected.lat])!, r = markerSize(selected) * f;
    placed.push([tf.applyX(p[0]) - r, tf.applyY(p[1]) - r, tf.applyX(p[0]) + r, tf.applyY(p[1]) + r * 0.7]);
  }
  for (const d of cand) {
    const vert = d.summitFt - d.baseFt;
    const want = selected?.id === d.id || k >= 4.5 || (vert >= 2000 && k >= 1.8) || (vert >= 1000 && k >= 2.8);
    if (!want) continue;
    const p = projection([d.lon, d.lat])!;
    const x = tf.applyX(p[0]), y = tf.applyY(p[1]) + (markerSize(d) * 0.72 + 8) * f;
    const hw = d.name.length * 3.7 * f + 4, hh = 9 * f;
    const box: [number, number, number, number] = [x - hw, y - hh, x + hw, y + hh];
    if (selected?.id !== d.id && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    placed.push(box); visible.add(d.id);
  }
  markG.selectAll<SVGGElement, Mountain>('g.m')
    .attr('class', d => `m s-${d.season.status}${selected?.id === d.id ? ' sel' : ''}${openOnly && d.season.status !== 'open' ? ' dim' : ''}`)
    .each(function (d) {
      select(this).select('.in').attr('transform', `scale(${inv})`);
      select(this).select('.lbl').attr('display', visible.has(d.id) ? 'inline' : 'none');
    });
  landG.selectAll('.state').attr('stroke-width', 1.2 / k);
  landG.selectAll('.state-label').style('font-size', `${13 / Math.pow(k, 0.9)}px`).style('opacity', k > 5 ? 0 : 1);
}

function flyTo(m: Mountain, ms = 1100) {
  const [w, h] = size();
  const [x, y] = projection([m.lon, m.lat])!;
  const scale = isWide() ? 7 : 6;
  // keep the mountain in the part of the map not covered by the panel
  const cx = isWide() ? (w - 420) / 2 : w / 2;
  const cy = isWide() ? h / 2 : h * 0.2;
  const t = zoomIdentity.translate(cx, cy).scale(scale).translate(-x, -y);
  if (ms) svg.transition().duration(ms).call(zoomer.transform, t); else svg.call(zoomer.transform, t);
}

function resetView() { svg.transition().duration(900).call(zoomer.transform, zoomIdentity); }

// ---------------------------------------------------------------- panel
const panel = $<HTMLElement>('#panel');
const statusWord = (m: Mountain) => m.season.status === 'open' ? 'Open' : m.season.status === 'closed' ? 'Closed' : 'Status on official site';

function pick(m: Mountain) {
  selected = m;
  history.replaceState(null, '', '#' + m.id);
  renderPanel(m);
  flyTo(m);
  restyle();
}

function closePanel() {
  if (!selected) return;
  selected = null;
  history.replaceState(null, '', location.pathname + location.search);
  panel.hidden = true;
  document.body.classList.remove('has-panel');
  resetView();
  restyle();
}

function seasonBlock(m: Mountain) {
  const s = m.season;
  if (s.status === 'open') return '';
  let head: string, sub = '';
  if (s.status === 'closed') {
    head = s.openingDate ? `Opening ${longDate(s.openingDate)}` : s.note ? 'Closed for now. The resort says:' : 'No opening date in the resort’s report yet';
    if (s.openingDate) sub = 'Projected by the resort. Opening days depend on weather and can move.';
  } else {
    head = 'Open or closed? Check the official report';
    sub = m.sourceNote ?? '';
  }
  const quote = s.note ? `<blockquote>“${esc(s.note)}”<cite>${esc(m.name)} snow report</cite></blockquote>` : '';
  return `<section class="card when"><h3>${s.status === 'closed' ? 'When does it open?' : 'Season status'}</h3><p class="big">${esc(head)}</p>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}${quote}</section>`;
}

function liftsBlock(m: Mountain) {
  const L = m.lifts;
  const head = `<h3>Lifts</h3>`;
  if (!L) {
    const why = m.coverage === 'live' && m.season.status === 'closed'
      ? 'The resort is not listing any lifts as running.'
      : (m.sourceNote ?? 'Live lift status for this mountain is on the official site.');
    return `<section class="card">${head}<p class="muted">${esc(why)}</p><div id="diagram" class="diagram"></div></section>`;
  }
  const order: Record<LiftStatus, number> = { open: 0, hold: 1, scheduled: 2, closed: 3 };
  const label: Record<LiftStatus, string> = { open: 'Open', hold: 'On hold', scheduled: 'Scheduled', closed: 'Closed' };
  const rows = [...L.list].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
    .map(l => `<li class="l-${l.status}" data-osm="${l.osmId ?? ''}"><span>${esc(l.name)}</span><em>${label[l.status]}</em></li>`).join('');
  const openNames = L.list.filter(l => l.status === 'open').map(l => l.name);
  return `<section class="card">${head}
    <div class="liftsum"><b>${L.open}</b> of ${L.total} lifts open <span class="pct">${L.pct}%</span></div>
    <div class="bar"><i style="width:${L.pct}%"></i></div>
    ${openNames.length ? `<p class="opennames"><b>Running now:</b> ${esc(openNames.join(', '))}</p>` : ''}
    <div id="diagram" class="diagram"></div>
    <ul class="lifts">${rows}</ul>
    ${m.stale ? `<p class="warn">The resort’s report could not be read on the last check. Showing the last reading from ${ago(m.liftsUpdated)}.</p>` : ''}
  </section>`;
}

function snowBlock(m: Mountain) {
  const w = m.weather;
  if (!w) return `<section class="card"><h3>Snow &amp; weather</h3><p class="muted">Forecast unavailable right now.</p></section>`;
  const ti = w.days.findIndex(d => d.date === w.today);
  const next = w.days.slice(ti, ti + 6);
  const max = Math.max(1, ...next.map(d => d.snowIn));
  const days = next.map(d => `<li>
      <span class="d">${dayName(d.date, w.today)}</span>
      <span class="g" title="${esc(d.summary)}">${wxGlyph(d.code)}</span>
      <span class="s">${esc(d.summary)}</span>
      <span class="t">${d.hiF}° <i>${d.loF}°</i></span>
      <span class="sn${d.snowIn > 0 ? ' has' : ''}"><i style="width:${Math.round(100 * d.snowIn / max)}%"></i><b>${d.snowIn > 0 ? inches(d.snowIn) : '—'}</b></span>
      <span class="w">${d.windMph} mph</span></li>`).join('');
  return `<section class="card"><h3>Snow &amp; weather</h3>
    <div class="tiles">
      <div><b>${inches(w.past72In)}</b><span>last 3 days</span></div>
      <div><b>${inches(w.next24In)}</b><span>today</span></div>
      <div><b>${inches(w.next72In)}</b><span>next 3 days</span></div>
      <div><b>${inches(w.next7dIn)}</b><span>next 7 days</span></div>
    </div>
    ${resortSnowRow(m)}
    ${w.now ? `<p class="now">Now at ${w.elevationFt.toLocaleString()} ft: <b>${w.now.tempF}°F</b>, ${esc(w.now.summary.toLowerCase())}, wind ${w.now.windMph} mph</p>` : ''}
    <ul class="days">${days}</ul>
    <p class="muted small">Snowfall and forecast are modelled for mid-mountain (${w.elevationFt.toLocaleString()} ft) by Open-Meteo, not measured by the resort.${w.updated && Date.now() - new Date(w.updated).getTime() > 3 * 36e5 ? ` Forecast last refreshed ${ago(w.updated)}.` : ''}</p>
  </section>`;
}

function resortSnowRow(m: Mountain) {
  const r = m.resortSnow;
  if (!r) return '';
  const parts = [r.last24In != null ? `${inches(r.last24In)} in 24 hr` : '', r.last7dIn != null ? `${inches(r.last7dIn)} in 7 days` : '',
    r.baseDepthIn ? `${inches(r.baseDepthIn)} base` : '', r.seasonIn != null ? `${inches(r.seasonIn)} this season` : ''].filter(Boolean);
  return parts.length ? `<p class="resortsnow"><b>Measured by ${esc(m.name)}:</b> ${parts.join(' · ')}</p>` : '';
}

function newsBlock(m: Mountain) {
  if (!m.news?.length) return '';
  const items = m.news.map(n => `<li>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">` : ''}<b>${esc(n.title)}</b>${n.url ? '</a>' : ''}
    ${n.date ? `<time>${esc(new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</time>` : ''}
    ${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</li>`).join('');
  return `<section class="card"><h3>From the mountain</h3><ul class="news">${items}</ul></section>`;
}

function renderPanel(m: Mountain) {
  const vert = m.summitFt - m.baseFt;
  panel.innerHTML = `
    <button class="close" aria-label="Close and zoom out">×</button>
    <header>
      <span class="pill p-${m.season.status}">${esc(statusWord(m))}</span>
      <h2>${esc(m.name)}</h2>
      <p class="meta">${STATE_NAMES[m.state]} · summit ${m.summitFt.toLocaleString()} ft · ${vert.toLocaleString()} ft vertical</p>
    </header>
    ${seasonBlock(m)}
    ${liftsBlock(m)}
    ${snowBlock(m)}
    ${newsBlock(m)}
    <section class="links">
      <a class="btn" href="${esc(m.reportUrl)}" target="_blank" rel="noopener">Official conditions report ↗</a>
      <a class="btn ghost" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(new URL(m.url).hostname.replace(/^www\./, ''))} ↗</a>
    </section>
    <p class="foot">${m.liftsUpdated ? `Lift status read from the resort ${ago(m.liftsUpdated)}. ` : ''}Always confirm with the mountain before you drive.</p>`;
  panel.hidden = false;
  panel.scrollTop = 0;
  document.body.classList.add('has-panel');
  panel.querySelector('.close')!.addEventListener('click', closePanel);
  drawDiagram(m);
}

// ---------------------------------------------------------------- lift diagram
async function drawDiagram(m: Mountain) {
  const box = panel.querySelector<HTMLElement>('#diagram');
  if (!box) return;
  let geo: LiftGeo;
  try { geo = await (await fetch(`data/lifts/${m.id}.json`)).json(); } catch { return; }
  if (selected?.id !== m.id || !geo.features.length) return;
  const status = new Map<number, Lift>();
  for (const l of m.lifts?.list ?? []) if (l.osmId) status.set(l.osmId, l);
  const pts = geo.features.flatMap(f => f.geometry.coordinates);
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const kx = Math.cos(lat0 * Math.PI / 180);
  const X = (p: [number, number]) => p[0] * kx, Y = (p: [number, number]) => -p[1];
  const minX = Math.min(...pts.map(X)), maxX = Math.max(...pts.map(X)), minY = Math.min(...pts.map(Y)), maxY = Math.max(...pts.map(Y));
  const W = 360, H = 230, pad = 22;
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6), (H - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  const P = (p: [number, number]) => `${(ox + (X(p) - minX) * s).toFixed(1)},${(oy + (Y(p) - minY) * s).toFixed(1)}`;
  const hasStatus = status.size > 0;
  const lines = geo.features.map(f => {
    const l = status.get(f.properties.osmId);
    const cls = l ? l.status : 'none';
    const c = f.geometry.coordinates;
    const name = l?.name ?? f.properties.name ?? f.properties.kind.replace(/_/g, ' ');
    const tip = `${name}${l ? ' · ' + l.status : hasStatus ? ' · status not reported' : ''}`;
    return `<g class="lift d-${cls}" data-osm="${f.properties.osmId}"><title>${esc(tip)}</title>
      <polyline class="hit" points="${c.map(P).join(' ')}"/><polyline points="${c.map(P).join(' ')}"/>
      <circle r="2.6" cx="${P(c[0]).split(',')[0]}" cy="${P(c[0]).split(',')[1]}"/><circle r="2.6" cx="${P(c[c.length - 1]).split(',')[0]}" cy="${P(c[c.length - 1]).split(',')[1]}"/></g>`;
  });
  // draw open lifts last so they sit on top
  lines.sort((a, b) => Number(a.includes('d-open')) - Number(b.includes('d-open')));
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lift diagram for ${esc(m.name)}">${lines.join('')}</svg>
    <div class="dkey">${hasStatus ? '<span class="k-open">Open</span><span class="k-hold">Hold</span><span class="k-closed">Closed</span><span class="k-none">Not reported</span>' : '<span class="k-none">Lift lines (live status not available)</span>'}
    <span class="north">N ↑</span></div>
    <p class="muted small">Lift lines © OpenStreetMap contributors. Tap a line for its name.${m.reportUrl ? ` For the full trail map, see <a href="${esc(m.url)}" target="_blank" rel="noopener">the resort’s site ↗</a>.` : ''}</p>
    <div class="dtip" hidden></div>`;
  const tip = box.querySelector<HTMLElement>('.dtip')!;
  box.querySelectorAll<SVGGElement>('g.lift').forEach(g => {
    const show = () => {
      box.querySelectorAll('g.lift.hl').forEach(x => x.classList.remove('hl'));
      g.classList.add('hl');
      tip.textContent = g.querySelector('title')!.textContent; tip.hidden = false;
      panel.querySelectorAll('.lifts li.hl').forEach(x => x.classList.remove('hl'));
      panel.querySelector(`.lifts li[data-osm="${g.dataset.osm}"]`)?.classList.add('hl');
    };
    g.addEventListener('mouseenter', show); g.addEventListener('click', show);
  });
  panel.querySelectorAll<HTMLElement>('.lifts li[data-osm]').forEach(li => {
    if (!li.dataset.osm) return;
    li.addEventListener('mouseenter', () => { box.querySelectorAll('g.lift.hl').forEach(x => x.classList.remove('hl')); box.querySelector(`g.lift[data-osm="${li.dataset.osm}"]`)?.classList.add('hl'); });
  });
}

// ---------------------------------------------------------------- search + filters
const q = $<HTMLInputElement>('#q');
const results = $<HTMLUListElement>('#results');
let hits: Mountain[] = [], cursor = 0;

function search() {
  const t = q.value.trim().toLowerCase();
  if (!t) { results.hidden = true; return; }
  const score = (m: Mountain) => {
    const n = m.name.toLowerCase();
    return n.startsWith(t) ? 0 : n.split(/[\s'-]+/).some(w => w.startsWith(t)) ? 1 : n.includes(t) ? 2
      : STATE_NAMES[m.state].toLowerCase().startsWith(t) || m.state.toLowerCase() === t ? 3 : 9;
  };
  hits = mountains.filter(m => score(m) < 9).sort((a, b) => score(a) - score(b) || (b.summitFt - b.baseFt) - (a.summitFt - a.baseFt)).slice(0, 8);
  cursor = 0;
  results.innerHTML = hits.length
    ? hits.map((m, i) => `<li role="option" data-i="${i}" class="${i === 0 ? 'on' : ''}"><i class="dot s-${m.season.status}"></i><span>${esc(m.name)}</span><em>${m.state} · ${esc(statusWord(m))}</em></li>`).join('')
    : `<li class="none">No mountain matches “${esc(q.value)}”</li>`;
  results.hidden = false;
}
function choose(i: number) { const m = hits[i]; if (!m) return; q.value = ''; results.hidden = true; q.blur(); pick(m); }
q.addEventListener('input', search);
q.addEventListener('focus', search);
q.addEventListener('keydown', ev => {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault(); if (!hits.length) return;
    cursor = (cursor + (ev.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    results.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === cursor));
  } else if (ev.key === 'Enter') choose(cursor);
  else if (ev.key === 'Escape') { results.hidden = true; q.blur(); }
});
results.addEventListener('mousedown', ev => { const li = (ev.target as Element).closest('li[data-i]') as HTMLElement | null; if (li) { ev.preventDefault(); choose(+li.dataset.i!); } });
document.addEventListener('click', ev => { if (!(ev.target as Element).closest('.search')) results.hidden = true; });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.activeElement !== q) closePanel(); });

const chip = $<HTMLButtonElement>('#openOnly');
chip.addEventListener('click', () => {
  openOnly = !openOnly;
  chip.setAttribute('aria-pressed', String(openOnly));
  restyle(); renderStatus();
});
$<HTMLAnchorElement>('#home').addEventListener('click', ev => { ev.preventDefault(); closePanel(); resetView(); });

// ---------------------------------------------------------------- status + legend
let generatedAt = '';
function renderStatus() {
  const open = mountains.filter(m => m.season.status === 'open').length;
  const closed = mountains.filter(m => m.season.status === 'closed').length;
  const unknown = mountains.length - open - closed;
  $<HTMLElement>('#legend').innerHTML = `
    <span><svg viewBox="-8 -8 16 16"><path class="tri s-open" d="M0,-6L6,5L-6,5Z"/></svg>Open <b>${open}</b></span>
    <span><svg viewBox="-8 -8 16 16"><path class="tri s-closed" d="M0,-6L6,5L-6,5Z"/></svg>Closed <b>${closed}</b></span>
    <span><svg viewBox="-8 -8 16 16"><path class="tri s-unknown" d="M0,-6L6,5L-6,5Z"/></svg>See resort site <b>${unknown}</b></span>`;
  const lead = open === 0 ? 'No mountain is reporting open lifts right now' : `${open} of ${mountains.length} mountains open now`;
  $<HTMLElement>('#status').textContent = `${lead} · updated ${ago(generatedAt)}${openOnly && open === 0 ? ' · turn off “Open now” to see all' : ''}`;
}

async function load(first = false) {
  try {
    const snap: Snapshot = await (await fetch(`data/snapshot.json?t=${Math.floor(Date.now() / 300000)}`)).json();
    mountains = snap.mountains; generatedAt = snap.generatedAt;
    drawMarkers(); renderStatus();
    if (selected) { const m = mountains.find(x => x.id === selected!.id); if (m) { selected = m; if (!first) renderPanelKeepScroll(m); } }
    if (first) { const id = location.hash.slice(1); const m = mountains.find(x => x.id === id); if (m) { pick(m); flyTo(m, 0); } }
  } catch {
    if (first) $<HTMLElement>('#status').textContent = 'Could not load mountain data. Please refresh.';
  }
}
function renderPanelKeepScroll(m: Mountain) { const y = panel.scrollTop; renderPanel(m); panel.scrollTop = y; }

window.addEventListener('hashchange', () => {
  const m = mountains.find(x => x.id === location.hash.slice(1));
  if (m && m.id !== selected?.id) pick(m);
});
layout();
let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(layout, 120); });
load(true);
setInterval(() => load(false), 5 * 60 * 1000);
setInterval(renderStatus, 60 * 1000);
