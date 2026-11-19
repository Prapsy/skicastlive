import './style.css';
import { type Mountain, type Snapshot, $, esc, vert, statusWord, regionName, ago, snow, isMetric, setMetric } from './types';
import { globe } from './globe';
import { mountainPanel } from './panel';
import { picker } from './picker';

let mountains: Mountain[] = [];
let selected: Mountain | null = null;
let generatedAt = '';
const isWide = () => window.innerWidth >= 900;
const rail = $<HTMLElement>('#rail'), panelEl = $<HTMLElement>('#panel');

// Part of the globe area covered by the rail and the panel, so the globe centres itself in what is left.
function insets() {
  const main = $<HTMLElement>('main').getBoundingClientRect();
  if (isWide()) return { left: rail.getBoundingClientRect().right - main.left, right: panelEl.hidden ? 0 : main.right - panelEl.getBoundingClientRect().left, top: 0, bottom: 0 };
  const sheet = panelEl.hidden ? rail : panelEl;
  return { left: 0, right: 0, top: 0, bottom: Math.max(0, main.bottom - sheet.getBoundingClientRect().top) };
}

function pick(m: Mountain, ms = 1400) {
  selected = m;
  history.replaceState(null, '', '#' + m.id);
  mountainPanel.show(m);
  picker.showGroup(m.group);
  globe.setFocus(null);
  globe.setSelected(m);
  globe.toMountain(m, ms);
}

function closePanel() {
  if (!selected) return;
  selected = null;
  history.replaceState(null, '', location.pathname + location.search);
  mountainPanel.hide();
  globe.setSelected(null);
  showScope();
}

/** Point the globe at whatever the rail is showing: a region, a state, or all of North America. */
function showScope() {
  const scope = picker.scope();
  globe.setFocus(picker.group);
  if (scope?.length) globe.toMountains(scope); else globe.home();
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

// ---------------------------------------------------------------- top bar
const units = $<HTMLButtonElement>('#units');
function renderUnits() { units.textContent = isMetric() ? '°C · cm' : '°F · in'; units.setAttribute('aria-label', `Units: ${isMetric() ? 'metric' : 'imperial'}. Switch.`); }
units.addEventListener('click', () => { setMetric(!isMetric()); renderUnits(); renderLive(); picker.render(); mountainPanel.refresh(); });
$<HTMLAnchorElement>('#home').addEventListener('click', ev => { ev.preventDefault(); if (selected) closePanel(); else globe.home(); });

function renderLive() {
  const open = mountains.filter(m => m.season.status === 'open').length;
  const leaders = mountains.filter(m => (m.resortSnow?.last72In ?? 0) > 0).sort((a, b) => b.resortSnow!.last72In! - a.resortSnow!.last72In!).slice(0, 3);
  $<HTMLElement>('#live').innerHTML = `<span class="count"><i class="${open ? 'on' : ''}"></i><b>${open}</b> open in North America</span>
    <span class="upd">updated ${ago(generatedAt)}</span>
    ${leaders.length ? `<span class="leaders"><em>Most snow, 3 days</em>${leaders.map(m => `<button data-m="${m.id}">${esc(m.name)} <b>${snow(m.resortSnow!.last72In!)}</b></button>`).join('')}</span>` : ''}`;
  const closed = mountains.filter(m => m.season.status === 'closed').length;
  $<HTMLElement>('#legend').innerHTML = `<span><i class="k s-open"></i>Open <b>${open}</b></span><span><i class="k s-closed"></i>Closed <b>${closed}</b></span><span><i class="k s-unknown"></i>See resort site <b>${mountains.length - open - closed}</b></span>`;
}
$<HTMLElement>('#live').addEventListener('click', ev => {
  const b = (ev.target as Element).closest('button[data-m]') as HTMLElement | null;
  const m = b && mountains.find(x => x.id === b.dataset.m);
  if (m) pick(m);
});

// ---------------------------------------------------------------- data
async function load(first = false) {
  try {
    const snap: Snapshot = await (await fetch(`data/snapshot.json?t=${Math.floor(Date.now() / 300000)}`)).json();
    mountains = snap.mountains; generatedAt = snap.generatedAt;
    globe.setMountains(mountains); picker.setMountains(mountains); renderLive();
    if (selected) { const m = mountains.find(x => x.id === selected!.id); if (m) { selected = m; globe.setSelected(m); if (!first) mountainPanel.refresh(m); } }
    if (first) globe.whenReady(() => { const m = mountains.find(x => x.id === location.hash.slice(1)); if (m) pick(m, 0); else globe.home(0); });
  } catch {
    if (first) $<HTMLElement>('#live').textContent = 'Could not load mountain data. Please refresh.';
  }
}

globe.init({ insets, onPick: m => pick(m), onBackground: closePanel });
mountainPanel.init({ onClose: closePanel });
picker.init({ onPick: m => pick(m), onScope: () => { if (selected) closePanel(); else showScope(); } });
renderUnits();
window.addEventListener('hashchange', () => {
  const m = mountains.find(x => x.id === location.hash.slice(1));
  if (m && m.id !== selected?.id) pick(m);
});
load(true);
setInterval(() => load(false), 5 * 60 * 1000);
setInterval(renderLive, 60 * 1000);
