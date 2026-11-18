// Bousquet Mountain (bousquetmountain.com/lift-trail-status): an Elementor page. Each lift row holds a name heading and
// several ready-made status badges (OPEN / CLOSED / Hold); staff show one and hide the rest with Elementor's
// "hidden on desktop + tablet + mobile" switches. So the status is the single badge that is NOT hidden.
// No visible badge, or two visible badges that disagree, is treated as closed.
import { normStatus } from '../lib/parse.mjs';
import { load, pageText, squash, NOT_A_LIFT, notes } from './_shared.mjs';

const hidden = cls => ['desktop', 'tablet', 'mobile'].every(d => new RegExp(`\\belementor-hidden-${d}\\b`).test(cls || ''));

export default async function bousquet({ url, pageUrl, get }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason || 'page not available');
  const $ = load(r.text);
  const lifts = [], seen = new Set();
  let on = false, done = false;
  $('section.elementor-inner-section').each((_, e) => {
    if (done) return;
    const sec = $(e);
    const heads = sec.find('h1,h2,h3,h4').toArray().map(h => squash($(h).text()));
    const badges = sec.find('.elementor-widget-icon-list').toArray();
    // Lift blocks ("chairs", "carpets") each start with a header row whose only heading is "Status";
    // the trail table that follows starts with "Condition" + "Status".
    if (!badges.length && heads.length === 1 && /^status$/i.test(heads[0])) { on = true; return; }
    if (heads.some(h => /^condition$/i.test(h))) { on = false; done = true; return; }
    if (!on || heads.length !== 1 || !badges.length) return;
    const name = heads[0].replace(/\s*\(.*$/s, '').trim(); // drop "(open @3pm midweek)" style remarks
    if (!name || NOT_A_LIFT.test(name) || /tube town/i.test(name) || seen.has(name.toLowerCase())) return;
    const shown = [...new Set(badges.filter(b => !hidden($(b).attr('class'))).map(b => normStatus($(b).text())))];
    seen.add(name.toLowerCase());
    lifts.push({ name, status: shown.length === 1 ? shown[0] : 'closed' });
  });
  if (!lifts.length) throw new Error('no lift rows found on page');
  return { lifts, ...notes({ reportText: '', bodyText: pageText($), pageUrl }) };
}
