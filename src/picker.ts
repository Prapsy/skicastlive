// Left rail: "Where do you plan on skiing?" -> region -> OnTheSnow-style Open / Closed tables.
import { type Mountain, GROUPS, REGIONS, $, esc, vert, snow, shortDate, depthIn, recentIn } from './types';

const rail = $<HTMLElement>('#rail');
let mountains: Mountain[] = [];
let group: string | null = null;
let state: string | null = null;
let sort: { key: 'name' | 'depth' | 'lifts' | 'runs' | 'recent'; dir: 1 | -1 } = { key: 'lifts', dir: -1 };
let onPick: (m: Mountain) => void = () => {};
let onScope: (ms: Mountain[] | null, group: string | null) => void = () => {};
const isOpen = (m: Mountain) => m.season.status === 'open';
const frac = (a: number | null | undefined, b: number | undefined) => (b ? `<b>${a ?? '–'}</b><i>/${b}</i>` : '–');

function home() {
  const open = mountains.filter(isOpen);
  const cards = GROUPS.map(g => {
    const ms = mountains.filter(m => m.group === g.id), n = ms.filter(isOpen).length;
    return `<li><button data-group="${g.id}" class="${n ? 'has-open' : ''}">
      <span class="gname">${esc(g.name)}</span><span class="gblurb">${esc(g.blurb)}</span>
      <span class="gopen">${n ? `<i></i>${n} open` : 'None open yet'}</span><span class="gcount">${ms.length} mountains</span></button></li>`;
  }).join('');
  const rows = [...open].sort((a, b) => (b.lifts?.open ?? 0) - (a.lifts?.open ?? 0) || vert(b) - vert(a)).map(m => `<li><button data-m="${m.id}">
      <span class="dot s-open"></span><span class="n">${esc(m.name)}<em>${m.state}</em></span><span class="v">${m.lifts ? `${m.lifts.open}/${m.lifts.total} lifts` : 'Open'}</span></button></li>`).join('');
  rail.innerHTML = `<div class="railhead"><p class="eyebrow">North America</p><h1>Where do you plan on skiing?</h1>
      <p class="sub">${open.length ? `${open.length} of ${mountains.length} mountains are spinning lifts right now.` : 'No mountain is reporting open lifts right now.'} Pick a region, or spin the globe.</p></div>
    <ul class="groups">${cards}</ul>
    ${rows ? `<h2 class="railh">Open right now <b>${open.length}</b></h2><ul class="openlist">${rows}</ul>` : ''}`;
}

function region(g: string) {
  const info = GROUPS.find(x => x.id === g)!;
  const all = mountains.filter(m => m.group === g);
  const codes = REGIONS.filter(r => r.group === g && all.some(m => m.state === r.code));
  const ms = state ? all.filter(m => m.state === state) : all;
  const val = (m: Mountain) => sort.key === 'depth' ? depthIn(m) ?? -1 : sort.key === 'lifts' ? m.lifts?.open ?? -1 : sort.key === 'runs' ? m.runs?.open ?? -1 : recentIn(m);
  const open = ms.filter(isOpen).sort((a, b) => sort.key === 'name' ? sort.dir * a.name.localeCompare(b.name) : sort.dir * (val(a) - val(b)) || a.name.localeCompare(b.name));
  const closed = ms.filter(m => m.season.status === 'closed').sort((a, b) => (a.season.openingDate ?? '9').localeCompare(b.season.openingDate ?? '9') || a.name.localeCompare(b.name));
  const unknown = ms.filter(m => m.season.status === 'unknown').sort((a, b) => a.name.localeCompare(b.name));
  const th = (key: typeof sort.key, label: string) => `<th${key === 'name' ? '' : ' class="num"'} aria-sort="${sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${key}">${label}</button></th>`;
  const name = (m: Mountain) => `<td class="name"><button data-m="${m.id}">${esc(m.name)}</button>${state ? '' : `<em>${m.state}</em>`}</td>`;
  rail.innerHTML = `<div class="railhead"><button class="back" data-back>← All regions</button><h1>${esc(info.name)}</h1>
      <p class="sub">${open.length ? `${open.length} of ${ms.length} mountains open now` : `None of the ${ms.length} mountains here is open yet`}</p>
      ${codes.length > 1 ? `<div class="states"><button data-state="" aria-pressed="${!state}">All</button>${codes.map(r => `<button data-state="${r.code}" aria-pressed="${state === r.code}" title="${esc(r.name)}">${r.code}</button>`).join('')}</div>` : ''}</div>
    ${open.length ? `<h2 class="railh">Open <b>${open.length}</b></h2><div class="tablewrap"><table class="rt"><thead><tr>${th('name', 'Resort')}${th('depth', 'Depth')}${th('lifts', 'Lifts')}${th('runs', 'Runs')}${th('recent', '3-day')}</tr></thead><tbody>
      ${open.map(m => `<tr>${name(m)}<td class="num">${depthIn(m) != null ? snow(depthIn(m)!) : '–'}</td><td class="num">${frac(m.lifts?.open, m.lifts?.total)}</td><td class="num">${frac(m.runs?.open, m.runs?.total)}</td><td class="num">${recentIn(m) > 0 ? snow(recentIn(m)) : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${closed.length ? `<h2 class="railh">Closed <b>${closed.length}</b></h2><div class="tablewrap"><table class="rt"><thead><tr><th>Resort</th><th class="num">Projected opening</th></tr></thead><tbody>
      ${closed.map(m => `<tr>${name(m)}<td class="num">${m.season.openingDate ? shortDate(m.season.openingDate) : '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${unknown.length ? `<h2 class="railh">Check the resort’s site <b>${unknown.length}</b></h2><div class="tablewrap"><table class="rt"><tbody>
      ${unknown.map(m => `<tr>${name(m)}<td class="num">–</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

function render() { const y = rail.scrollTop; if (group) region(group); else home(); rail.scrollTop = y; }
const scope = () => (group ? mountains.filter(m => m.group === group && (!state || m.state === state)) : null);

rail.addEventListener('click', ev => {
  const b = (ev.target as Element).closest('button') as HTMLButtonElement | null;
  if (!b) return;
  if (b.dataset.m) { const m = mountains.find(x => x.id === b.dataset.m); if (m) onPick(m); return; }
  if (b.dataset.sort) { const key = b.dataset.sort as typeof sort.key; sort = { key, dir: sort.key === key ? (-sort.dir as 1 | -1) : key === 'name' ? 1 : -1 }; render(); return; }
  if (b.dataset.group) { group = b.dataset.group; state = null; rail.scrollTop = 0; }
  else if ('back' in b.dataset) { group = null; state = null; rail.scrollTop = 0; }
  else if ('state' in b.dataset) state = b.dataset.state || null;
  else return;
  render(); onScope(scope(), group);
});

export const picker = {
  init(opts: { onPick: typeof onPick; onScope: typeof onScope }) { onPick = opts.onPick; onScope = opts.onScope; },
  setMountains(ms: Mountain[]) { mountains = ms; render(); },
  render,
  scope,
  get group() { return group; },
  /** Open a region's list without moving the globe (used when a mountain is picked from the map or search). */
  showGroup(g: string) { if (group !== g) { group = g; state = null; rail.scrollTop = 0; render(); } },
};
