// The mountain panel: Report · Weather · Ski map · News.
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { type Mountain, type Lift, type LiftStatus, type Terrain, $, esc, vert, statusWord, regionName, snow, temp, tempUnit, elev, wind, ago, dayName, longDate, shortDate, wxGlyph, depthIn } from './types';

type Tab = 'report' | 'weather' | 'map' | 'news';
const TABS: [Tab, string][] = [['report', 'Report'], ['weather', 'Weather'], ['map', 'Ski map'], ['news', 'News']];
const panel = $<HTMLElement>('#panel');
let current: Mountain | null = null;
let tab: Tab = 'report';
let onClose: () => void = () => {};
const terrainCache = new Map<string, Promise<Terrain | null>>();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'resort site'; } };
const link = (href: string | null | undefined, label: string, cls = 'btn') => href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';

function sourceLine(m: Mountain) {
  if (m.coverage === 'live') return `Lift status read from ${esc(m.name)}’s own report ${ago(m.liftsUpdated)}.`;
  if (m.coverage === 'report') return `Reported by ${esc(m.name)} via <a href="${esc(m.otsUrl)}" target="_blank" rel="noopener">OnTheSnow</a>, updated ${ago(m.liftsUpdated)}.`;
  return esc(m.sourceNote ?? 'Live status for this mountain is on the official site.');
}

function seasonBlock(m: Mountain) {
  const s = m.season;
  if (s.status === 'open') return m.closingDate ? `<p class="muted season-line">Projected closing day: ${esc(longDate(m.closingDate))}</p>` : '';
  let head: string, sub = '';
  if (s.status === 'closed') {
    head = s.openingDate ? `Opening ${longDate(s.openingDate)}` : s.note ? 'Closed for now. The resort says:' : 'No opening date reported yet';
    if (s.openingDate) sub = 'Projected opening. Opening days depend on weather and can move.';
  } else {
    head = 'Open or closed? Check the official report';
    sub = m.sourceNote ?? '';
  }
  const quote = s.note ? `<blockquote>“${esc(s.note)}”<cite>${esc(m.name)} snow report</cite></blockquote>` : '';
  return `<section class="card when"><h3>${s.status === 'closed' ? 'When does it open?' : 'Season status'}</h3><p class="big">${esc(head)}</p>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}${quote}</section>`;
}

function statsBlock(m: Mountain) {
  const L = m.lifts, R = m.runs, d = depthIn(m), r = m.resortSnow;
  if (!L && !R && d == null) return '';
  const stat = (label: string, big: string, small = '') => `<div><span>${label}</span><b>${big}</b>${small ? `<i>${small}</i>` : ''}</div>`;
  const pct = R?.pct ?? L?.pct ?? null;
  const cells = [
    L ? stat('Lifts open', `${L.open}<em> / ${L.total}</em>`) : '',
    R ? stat('Runs open', `${R.open ?? '–'}<em> / ${R.total}</em>`) : '',
    pct != null ? stat('Terrain open', `${pct}<em>%</em>`) : '',
    d != null ? stat('Snow depth', snow(d), r?.baseDepthIn && r?.summitDepthIn && r.baseDepthIn !== r.summitDepthIn ? `base ${snow(r.baseDepthIn)}` : '') : '',
    r?.last72In != null && (m.season.status === 'open' || r.last72In > 0) ? stat('Last 3 days', snow(r.last72In), 'reported') : '',
  ].filter(Boolean).join('');
  return `<section class="card"><h3>Lifts &amp; terrain</h3><div class="stats">${cells}</div>
    ${pct != null ? `<div class="bar"><i style="width:${Math.max(pct, pct > 0 ? 3 : 0)}%"></i></div>` : ''}</section>`;
}

function liftsBlock(m: Mountain) {
  const L = m.lifts;
  if (!L?.list.length) return '';
  const order: Record<LiftStatus, number> = { open: 0, hold: 1, scheduled: 2, closed: 3 };
  const label: Record<LiftStatus, string> = { open: 'Open', hold: 'On hold', scheduled: 'Scheduled', closed: 'Closed' };
  const rows = [...L.list].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
    .map(l => `<li class="l-${l.status}"><span>${esc(l.name)}</span><em>${label[l.status]}</em></li>`).join('');
  const openNames = L.list.filter(l => l.status === 'open').map(l => l.name);
  return `<section class="card"><h3>Lift by lift</h3>
    ${openNames.length ? `<p class="opennames"><b>Running now:</b> ${esc(openNames.join(', '))}</p>` : ''}
    <ul class="lifts">${rows}</ul>
    ${m.stale ? `<p class="warn">The resort’s report could not be read on the last check. Showing the last reading from ${ago(m.liftsUpdated)}.</p>` : ''}
  </section>`;
}

function reportTab(m: Mountain) {
  const w = m.weather;
  const quick = w ? `<section class="card"><h3>Snow at a glance</h3><div class="tiles">
      <div><b>${snow(w.past72In)}</b><span>last 3 days</span></div><div><b>${snow(w.next24In)}</b><span>today</span></div>
      <div><b>${snow(w.next72In)}</b><span>next 3 days</span></div><div><b>${snow(w.next7dIn)}</b><span>next 7 days</span></div></div>
      ${w.now ? `<p class="now">Now at ${elev(w.elevationFt)}: <b>${temp(w.now.tempF)}${tempUnit().slice(1)}</b>, ${esc(w.now.summary.toLowerCase())}, wind ${wind(w.now.windMph)}</p>` : ''}</section>` : '';
  return `${seasonBlock(m)}${statsBlock(m)}${liftsBlock(m)}${quick}
    <section class="links">${link(m.reportUrl, 'Official conditions report')}${m.url ? link(m.url, host(m.url), 'btn ghost') : ''}</section>
    <p class="foot">${sourceLine(m)} Always confirm with the mountain before you drive.</p>`;
}

function weatherTab(m: Mountain) {
  const w = m.weather;
  if (!w) return `<section class="card"><h3>Snow &amp; weather</h3><p class="muted">Forecast unavailable right now.</p></section>`;
  const ti = w.days.findIndex(d => d.date === w.today);
  const past = w.days.slice(Math.max(0, ti - 3), ti), next = w.days.slice(ti, ti + 7);
  const max = Math.max(1, ...next.map(d => d.snowIn), ...past.map(d => d.snowIn));
  const row = (d: typeof next[number]) => `<li>
      <span class="d">${dayName(d.date, w.today)}</span>
      <span class="g" title="${esc(d.summary)}">${wxGlyph(d.code)}</span>
      <span class="s">${esc(d.summary)}</span>
      <span class="t">${temp(d.hiF)} <i>${temp(d.loF)}</i></span>
      <span class="sn${d.snowIn > 0 ? ' has' : ''}"><i style="width:${Math.round(100 * d.snowIn / max)}%"></i><b>${d.snowIn > 0 ? snow(d.snowIn) : '—'}</b></span>
      <span class="w">${wind(d.windMph)}</span></li>`;
  const r = m.resortSnow;
  const measured = r ? [r.last24In != null ? `${snow(r.last24In)} in 24 hr` : '', r.last72In != null ? `${snow(r.last72In)} in 3 days` : '', r.last7dIn != null ? `${snow(r.last7dIn)} in 7 days` : '',
    depthIn(m) != null ? `${snow(depthIn(m)!)} deep` : '', r.seasonIn != null ? `${snow(r.seasonIn)} this season` : ''].filter(Boolean) : [];
  return `<section class="card"><h3>Snow</h3>
      <div class="tiles">
        <div><b>${snow(w.past72In)}</b><span>last 3 days</span></div><div><b>${snow(w.next24In)}</b><span>today</span></div>
        <div><b>${snow(w.next72In)}</b><span>next 3 days</span></div><div><b>${snow(w.next7dIn)}</b><span>next 7 days</span></div>
      </div>
      ${measured.length && (m.season.status === 'open' || depthIn(m) != null) ? `<p class="resortsnow"><b>Reported by ${esc(m.name)}:</b> ${measured.join(', ')}</p>` : ''}
      ${w.now ? `<p class="now">Now at ${elev(w.elevationFt)}: <b>${temp(w.now.tempF)}${tempUnit().slice(1)}</b>, ${esc(w.now.summary.toLowerCase())}, wind ${wind(w.now.windMph)}</p>` : ''}
    </section>
    <section class="card"><h3>7-day forecast</h3><ul class="days">${next.map(row).join('')}</ul></section>
    ${past.length ? `<section class="card"><h3>Last 3 days</h3><ul class="days">${past.map(row).join('')}</ul></section>` : ''}
    <p class="foot">Snowfall and forecast are modelled for mid-mountain (${elev(w.elevationFt)}) by Open-Meteo, not measured by the resort.${w.updated && Date.now() - new Date(w.updated).getTime() > 3 * 36e5 ? ` Forecast last refreshed ${ago(w.updated)}.` : ''}</p>`;
}

function newsTab(m: Mountain) {
  const items = (m.news ?? []).map(n => `<li>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">` : ''}<b>${esc(n.title)}</b>${n.url ? '</a>' : ''}
    ${n.date ? `<time>${esc(new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</time>` : ''}
    ${n.excerpt ? `<p>${esc(n.excerpt)}</p>` : ''}</li>`).join('');
  const s = m.season;
  const facts = [s.status === 'closed' && s.openingDate ? `Projected opening day is ${longDate(s.openingDate)}.` : '',
    s.status === 'open' && m.lifts ? `${m.lifts.open} of ${m.lifts.total} lifts are running${m.runs?.open != null ? ` with ${m.runs.open} of ${m.runs.total} runs open` : ''}.` : '',
    m.closingDate ? `Projected closing day is ${shortDate(m.closingDate)}.` : ''].filter(Boolean);
  return `${items ? `<section class="card"><h3>From the mountain</h3><ul class="news">${items}</ul></section>` : ''}
    ${facts.length ? `<section class="card"><h3>This season</h3>${facts.map(f => `<p>${esc(f)}</p>`).join('')}</section>` : ''}
    <section class="card"><h3>Straight from ${esc(m.name)}</h3>
      <p class="muted">Events, deals, road and parking updates are posted by the mountain itself.</p>
      <div class="links col">${m.url ? link(m.url, `${host(m.url)}: news and events`) : ''}${link(m.reportUrl, 'Official conditions report', 'btn ghost')}${link(m.otsUrl, 'OnTheSnow report, cams and reviews', 'btn ghost')}</div>
    </section>`;
}

// ---------------------------------------------------------------- ski map
const DIFF: Record<string, [string, string]> = { novice: ['easy', 'Easiest'], easy: ['easy', 'Easiest'], intermediate: ['inter', 'Intermediate'], advanced: ['adv', 'Advanced'], expert: ['exp', 'Expert'], freeride: ['exp', 'Expert'], extreme: ['exp', 'Expert'], other: ['other', 'Unrated'] };
function loadTerrain(m: Mountain) {
  if (!m.terrain) return Promise.resolve(null);
  if (!terrainCache.has(m.id)) terrainCache.set(m.id, fetch(`data/terrain/${m.id}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return terrainCache.get(m.id)!;
}

function mapTab(m: Mountain) {
  return `<section class="card"><h3>Ski map</h3><div id="skimap" class="skimap"><p class="muted">${m.terrain ? 'Drawing the mountain…' : 'No map data for this mountain yet.'}</p></div></section>
    <section class="links">${link(m.trailMapUrl ?? m.url, m.trailMapUrl ? 'Official trail map' : 'Official trail map on the resort site')}</section>
    <p class="foot">Drawn from OpenStreetMap data (© OpenStreetMap contributors, via OpenSkiMap), not the resort’s own artwork. Runs show their rated difficulty, not whether they are open today.</p>`;
}

async function drawSkiMap(m: Mountain) {
  const t = await loadTerrain(m);
  const box = panel.querySelector<HTMLElement>('#skimap');
  if (!box || current?.id !== m.id || tab !== 'map') return;
  if (!t || (!t.lifts.length && !t.runs.length)) { box.innerHTML = '<p class="muted">No map data for this mountain yet.</p>'; return; }
  const status = new Map<number, Lift>();
  for (const l of m.lifts?.list ?? []) if (l.osmId) status.set(l.osmId, l);
  const all = [...t.lifts, ...t.runs];
  const pts = all.flatMap(f => f.c);
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length, lon0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const kx = Math.cos(lat0 * Math.PI / 180);
  // Turn the map so uphill points up, like a trail map, when the lifts mostly agree on a direction.
  let ux = 0, uy = 0, tot = 0;
  for (const l of t.lifts) {
    const a = l.c[0], b = l.c[l.c.length - 1], up = l.e[1] >= l.e[0] ? 1 : -1;
    const dx = (b[0] - a[0]) * kx * up, dy = (b[1] - a[1]) * up;
    ux += dx; uy += dy; tot += Math.hypot(dx, dy);
  }
  const rotate = tot > 0 && Math.hypot(ux, uy) / tot > 0.45;
  const ang = rotate ? Math.atan2(ux, uy) : 0; // clockwise angle of "uphill" from north
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const xy = (p: [number, number]): [number, number] => { const x = (p[0] - lon0) * kx, y = p[1] - lat0; return [x * cos - y * sin, -(x * sin + y * cos)]; };
  const proj = pts.map(xy);
  const minX = Math.min(...proj.map(p => p[0])), maxX = Math.max(...proj.map(p => p[0])), minY = Math.min(...proj.map(p => p[1])), maxY = Math.max(...proj.map(p => p[1]));
  const W = 368, H = 320, pad = 16;
  const s = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1e-6), (H - 2 * pad) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  const P = (p: [number, number]) => { const q = xy(p); return `${(ox + (q[0] - minX) * s).toFixed(1)},${(oy + (q[1] - minY) * s).toFixed(1)}`; };
  const order = ['easy', 'inter', 'other', 'adv', 'exp'];
  const runs = [...t.runs].sort((a, b) => order.indexOf((DIFF[a.d] ?? DIFF.other)[0]) - order.indexOf((DIFF[b.d] ?? DIFF.other)[0]))
    .map(r => { const [cls, word] = DIFF[r.d] ?? DIFF.other; const pl = r.c.map(P).join(' ');
      return `<g class="run r-${cls}" data-tip="${esc(`${r.n ?? 'Unnamed run'}, ${word.toLowerCase()}`)}"><polyline class="hit" points="${pl}"/><polyline points="${pl}"/></g>`; });
  const hasStatus = status.size > 0;
  const lifts = t.lifts.map(l => {
    const st = l.id != null ? status.get(l.id) : undefined;
    const name = st?.name ?? l.n ?? l.k.replace(/_/g, ' ');
    const a = P(l.c[0]).split(','), b = P(l.c[l.c.length - 1]).split(','), pl = l.c.map(P).join(' ');
    return `<g class="lift d-${st ? st.status : 'none'}" data-tip="${esc(`${name}, lift${st ? ', ' + st.status : ''}`)}"><polyline class="hit" points="${pl}"/><polyline class="case" points="${pl}"/><polyline points="${pl}"/>
      <circle r="2.4" cx="${a[0]}" cy="${a[1]}"/><circle r="2.4" cx="${b[0]}" cy="${b[1]}"/></g>`;
  }).sort((a, b) => Number(a.includes('d-open')) - Number(b.includes('d-open')));
  const counts = new Map<string, number>();
  for (const r of t.runs) { const c = (DIFF[r.d] ?? DIFF.other)[0]; counts.set(c, (counts.get(c) ?? 0) + 1); }
  const key = [['easy', 'Easiest'], ['inter', 'Intermediate'], ['adv', 'Advanced'], ['exp', 'Expert']].filter(([c]) => counts.get(c))
    .map(([c, wd]) => `<span class="k-run k-${c}">${wd} <b>${counts.get(c)}</b></span>`).join('');
  box.innerHTML = `<div class="mapwrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ski map of ${esc(m.name)}: ${t.runs.length} runs and ${t.lifts.length} lifts"><g class="vp">${runs.join('')}${lifts.join('')}</g></svg>
      <span class="north" title="North is this way"><i style="transform:rotate(${(-ang * 180 / Math.PI).toFixed(0)}deg)">↑</i>N</span>
      <button class="reset" type="button" hidden>Reset view</button></div>
    <div class="dtip">Tap a run or lift for its name. Pinch or scroll to zoom.</div>
    <div class="dkey">${key}</div>
    <div class="dkey">${hasStatus ? '<span class="k-open">Lift open</span><span class="k-hold">On hold</span><span class="k-closed">Lift closed</span>' : `<span class="k-none">Lift${m.lifts ? ` (${m.lifts.open} of ${m.lifts.total} open; the report does not say which)` : ''}</span>`}</div>`;
  const tip = box.querySelector<HTMLElement>('.dtip')!;
  const svgEl = box.querySelector<SVGSVGElement>('svg')!, reset = box.querySelector<HTMLButtonElement>('.reset')!;
  const vp = select(svgEl).select<SVGGElement>('.vp');
  const z = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 12]).translateExtent([[0, 0], [W, H]]).on('zoom', ev => {
    vp.attr('transform', ev.transform.toString()); svgEl.style.setProperty('--z', String(ev.transform.k)); reset.hidden = ev.transform.k < 1.05;
  });
  select(svgEl).call(z).on('dblclick.zoom', null);
  reset.addEventListener('click', () => { select(svgEl).call(z.transform, zoomIdentity); });
  const show = (g: Element) => { box.querySelectorAll('.hl').forEach(x => x.classList.remove('hl')); g.classList.add('hl'); tip.textContent = (g as HTMLElement).dataset.tip ?? ''; tip.classList.add('on'); };
  svgEl.addEventListener('pointerover', ev => { const g = (ev.target as Element).closest('g.run, g.lift'); if (g) show(g); });
  svgEl.addEventListener('click', ev => { const g = (ev.target as Element).closest('g.run, g.lift'); if (g) show(g); });
}

// ---------------------------------------------------------------- shell
function render(keepScroll = false) {
  const m = current;
  if (!m) return;
  const y = panel.scrollTop;
  const body = tab === 'report' ? reportTab(m) : tab === 'weather' ? weatherTab(m) : tab === 'map' ? mapTab(m) : newsTab(m);
  panel.innerHTML = `
    <button class="close" aria-label="Close and zoom out">×</button>
    <header>
      <span class="pill p-${m.season.status}">${esc(statusWord(m))}</span>
      <h2>${esc(m.name)}</h2>
      <p class="meta">${esc(regionName(m.state))}. Summit ${elev(m.summitFt)}, ${elev(vert(m))} of vertical.</p>
    </header>
    <nav class="tabs" role="tablist">${TABS.map(([id, label]) => `<button role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('')}</nav>
    <div class="tabbody">${body}</div>`;
  panel.hidden = false;
  panel.scrollTop = keepScroll ? y : 0;
  document.body.classList.add('has-panel');
  panel.querySelector('.close')!.addEventListener('click', () => onClose());
  panel.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab as Tab; render(); }));
  if (tab === 'map') drawSkiMap(m);
}

export const mountainPanel = {
  init(opts: { onClose: () => void }) { onClose = opts.onClose; },
  show(m: Mountain) { const same = current?.id === m.id; current = m; if (!same) tab = 'report'; render(same); },
  /** Fresh data or a units change: redraw in place. */
  refresh(m?: Mountain) { if (m) current = m; if (current && !panel.hidden) render(true); },
  hide() { current = null; panel.hidden = true; document.body.classList.remove('has-panel'); },
  get isOpen() { return !panel.hidden; },
};
