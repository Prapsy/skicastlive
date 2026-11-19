// Left column: the question and the regions. Regions are the first thing you choose; mountains come after.
import { type Mountain, GROUPS, $, esc } from './types';

const rail = $<HTMLElement>('#rail');
let mountains: Mountain[] = [];
let group: string | null = null;
let onRegion: (g: string | null) => void = () => {};
let onHover: (g: string | null) => void = () => {};

function render() {
  const open = mountains.filter(m => m.season.status === 'open').length;
  const rows = GROUPS.map(g => {
    const ms = mountains.filter(m => m.group === g.id), n = ms.filter(m => m.season.status === 'open').length;
    if (!ms.length) return '';
    return `<li><button data-group="${g.id}" aria-current="${group === g.id}" class="${n ? 'has-open' : ''}">
      <span class="gname">${esc(g.name)}</span><span class="gblurb">${esc(g.blurb)}</span>
      <span class="gopen">${n ? `${n} open` : 'None open yet'}</span><span class="gcount">${ms.length} mountains</span></button></li>`;
  }).join('');
  rail.className = group ? 'in-region' : 'home';
  rail.innerHTML = `<div class="railhead"><h1>Where do you plan on skiing?</h1>
      <p class="sub">${open ? `${open} of ${mountains.length} mountains have lifts turning right now.` : 'No mountain is reporting open lifts right now.'} Start with a region.</p></div>
    <ul class="groups">${rows}</ul>`;
}

rail.addEventListener('click', ev => {
  const b = (ev.target as Element).closest('button[data-group]') as HTMLButtonElement | null;
  if (b) onRegion(b.dataset.group === group ? null : b.dataset.group!);
});
const hover = (ev: Event) => { const b = (ev.target as Element).closest?.('button[data-group]') as HTMLButtonElement | null; onHover(b?.dataset.group ?? null); };
rail.addEventListener('mouseover', hover);
rail.addEventListener('focusin', hover);
rail.addEventListener('mouseleave', () => onHover(null));

export const picker = {
  init(opts: { onRegion: typeof onRegion; onHover: typeof onHover }) { onRegion = opts.onRegion; onHover = opts.onHover; },
  setMountains(ms: Mountain[]) { mountains = ms; render(); },
  setGroup(g: string | null) { if (g !== group) { group = g; render(); } },
  /** Mirror the region under the pointer on the globe. */
  highlight(g: string | null) { rail.querySelectorAll<HTMLElement>('button[data-group]').forEach(b => b.classList.toggle('hot', b.dataset.group === g)); },
};
