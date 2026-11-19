import './style.css';
import { type Mountain, type Snapshot, GROUPS, $, esc, vert, statusWord, regionName, ago, snow, isMetric, setMetric } from './types';
import { globe } from './globe';
import { mountainPanel } from './panel';
import { picker } from './picker';

// Three levels: overview (pick a region) -> region (its mountains light up, list on the right) -> mountain.
let mountains: Mountain[] = [];
let group: string | null = null;
let selected: Mountain | null = null;
let generatedAt = '';
const isWide = () => window.innerWidth >= 900;
const rail = $<HTMLElement>('#rail'), panelEl = $<HTMLElement>('#panel'), soon = $<HTMLElement>('#soon');
const inGroup = (g: string) => mountains.filter(m => m.group === g);
const setHash = (id: string | null) => history.replaceState(null, '', id ? '#' + id : location.pathname + location.search);

// Part of the globe area covered by the left column and the panel, so the globe centres itself in what is left.
function insets() {
  const main = $<HTMLElement>('main').getBoundingClientRect();
  if (isWide()) return { left: (rail.getBoundingClientRect().right - main.left) * 0.9, right: panelEl.hidden ? 0 : Math.min(panelEl.offsetWidth, 440), top: 0, bottom: 0 };
  const sheet = panelEl.hidden ? rail : panelEl;
  return { left: 0, right: 0, top: 0, bottom: Math.max(0, Math.min(main.height * 0.62, main.bottom - sheet.getBoundingClientRect().top)) };
}

/** Overview: regions only. */
function showOverview(fly = true) {
  group = null; selected = null;
  setHash(null);
  mountainPanel.hide(); picker.setGroup(null);
  globe.setSelected(null); globe.setFocus(null);
  if (fly) globe.home(); else globe.redraw();
}

/** A region: its mountains light up on the globe and line up on the right. */
function showRegion(g: string, fly = true) {
  const info = GROUPS.find(x => x.id === g);
  if (!info) return;
  group = g; selected = null;
  setHash(null);
  picker.setGroup(g);
  mountainPanel.showRegion(info, inGroup(g));
  globe.setSelected(null); globe.setFocus(g);
  if (fly) globe.toMountains(mountainPanel.scope()); else globe.redraw();
}

function pick(m: Mountain, ms = 1700) {
  const info = GROUPS.find(x => x.id === m.group);
  if (group !== m.group && info) { group = m.group; picker.setGroup(group); mountainPanel.showRegion(info, inGroup(m.group)); }
  selected = m;
  setHash(m.id);
  mountainPanel.show(m);
  globe.setFocus(group); globe.setSelected(m);
  globe.toMountain(m, ms);
}

/** One step back: full view -> mountain -> region -> overview. */
function back() {
  if (mountainPanel.isExpanded) mountainPanel.collapse();
  else if (selected && group) showRegion(group);
  else if (group || selected) showOverview();
}

// ---------------------------------------------------------------- search
const q = $<HTMLInputElement>('#q');
const results = $<HTMLUListElement>('#results');
let hits: Mountain[] = [], cursor = 0;
function search() {
  const t = q.value.trim().toLowerCase();
  if (!t) { results.hidden = true; return; }
  const score = (m: Mountain) => {
    const n = m.name.toLowerCase();
    return n.startsWith(t) ? 0 : n.split(/[\s'-]+/).some(w => w.startsWith(t)) ? 1 : n.includes(t) ? 2
      : regionName(m.state).toLowerCase().startsWith(t) || m.state.toLowerCase() === t ? 3 : 9;
  };
  hits = mountains.filter(m => score(m) < 9).sort((a, b) => score(a) - score(b) || Number(b.season.status === 'open') - Number(a.season.status === 'open') || vert(b) - vert(a)).slice(0, 8);
  cursor = 0;
  results.innerHTML = hits.length
    ? hits.map((m, i) => `<li role="option" data-i="${i}" class="${i === 0 ? 'on' : ''}"><i class="dot s-${m.season.status}"></i><span>${esc(m.name)}</span><em>${m.state}, ${esc(statusWord(m)).toLowerCase()}</em></li>`).join('')
    : `<li class="none">No mountain matches “${esc(q.value)}”</li>`;
  results.hidden = false;
}
function choose(i: number) { const m = hits[i]; if (!m) return; q.value = ''; results.hidden = true; q.blur(); mountainPanel.collapse(); pick(m); }
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
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.activeElement !== q) back(); });

// ---------------------------------------------------------------- top bar
const units = $<HTMLButtonElement>('#units');
function renderUnits() { units.textContent = isMetric() ? '°C, cm' : '°F, in'; units.setAttribute('aria-label', `Units: ${isMetric() ? 'metric' : 'imperial'}. Switch.`); }
units.addEventListener('click', () => { setMetric(!isMetric()); renderUnits(); renderLive(); mountainPanel.refresh(); });
$<HTMLAnchorElement>('#home').addEventListener('click', ev => { ev.preventDefault(); mountainPanel.collapse(); showOverview(); });

function renderLive() {
  const open = mountains.filter(m => m.season.status === 'open').length;
  const leaders = mountains.filter(m => (m.resortSnow?.last72In ?? 0) > 0).sort((a, b) => b.resortSnow!.last72In! - a.resortSnow!.last72In!).slice(0, 3);
  $<HTMLElement>('#live').innerHTML = `<span class="count"><i class="${open ? 'on' : ''}"></i><b>${open}</b><span>open<span class="where"> in North America</span></span></span>
    <span class="upd">Updated ${ago(generatedAt)}</span>
    ${leaders.length ? `<span class="leaders"><em>Most snow in 3 days</em>${leaders.map(m => `<button data-m="${m.id}">${esc(m.name)} <b>${snow(m.resortSnow!.last72In!)}</b></button>`).join('')}</span>` : ''}`;
}
$<HTMLElement>('#live').addEventListener('click', ev => {
  const b = (ev.target as Element).closest('button[data-m]') as HTMLElement | null;
  const m = b && mountains.find(x => x.id === b.dataset.m);
  if (m) { mountainPanel.collapse(); pick(m); }
});

// ---------------------------------------------------------------- beyond the map
function renderSoon(far: boolean, place: string) {
  soon.hidden = !far;
  if (far) soon.querySelector('.where')!.textContent = place;
}
soon.querySelector('button')!.addEventListener('click', () => showOverview());

// ---------------------------------------------------------------- data
async function load(first = false) {
  try {
    const snap: Snapshot = await (await fetch(`data/snapshot.json?t=${Math.floor(Date.now() / 300000)}`)).json();
    mountains = snap.mountains; generatedAt = snap.generatedAt;
    globe.setMountains(mountains); picker.setMountains(mountains); renderLive();
    if (selected) { selected = mountains.find(x => x.id === selected!.id) ?? selected; globe.setSelected(selected); }
    if (!first) mountainPanel.refresh(mountains);
    if (first) globe.whenReady(() => { const m = mountains.find(x => x.id === location.hash.slice(1)); if (m) pick(m, 0); else globe.home(0); });
  } catch {
    if (first) $<HTMLElement>('#live').textContent = 'Could not load mountain data. Refresh to try again.';
  }
}

globe.init({
  insets,
  pick: m => pick(m),
  region: g => showRegion(g),
  background: () => { if (selected) back(); },
  // zooming by hand steps through the levels without the globe taking over
  level: (to, g) => { if (to === 'overview') showOverview(false); else if (to === 'region' && group) showRegion(group, false); else if (to === 'enter' && g) showRegion(g, false); },
  hoverGroup: g => picker.highlight(g),
  far: renderSoon,
});
mountainPanel.init({
  back,
  pick: m => pick(m),
  scope: ms => { if (ms.length) globe.toMountains(ms); },
  hover: id => globe.hoverMountain(id),
  expand: () => globe.redraw(),
});
picker.init({ onRegion: g => { mountainPanel.collapse(); if (g) showRegion(g); else showOverview(); }, onHover: g => globe.hoverRegion(g) });
renderUnits();
window.addEventListener('hashchange', () => {
  const m = mountains.find(x => x.id === location.hash.slice(1));
  if (m && m.id !== selected?.id) pick(m);
});
load(true);
setInterval(() => load(false), 5 * 60 * 1000);
setInterval(renderLive, 60 * 1000);
