// Boyne Resorts sites (Loon, Sugarloaf, Sunday River, Pleasant Mountain): the /mountain-report page is a Next.js app
// that loads its lift list from the site's own /api/reportpal?resortName=<code>&useReportPal=true (Report Pal JSON).
// Lift status is the feed's own wording: "Open" | "On Hold" | "Closed" (statusIcon: open | on-hold | closed).
import { normStatus, text, clip, openingNote, openingDate } from '../lib/parse.mjs';
const arr = x => (Array.isArray(x) ? x : x ? [x] : []);
export default async function boyne({ url, get, pageUrl }) {
  const r = await get(url, { accept: 'application/json' });
  if (!r.ok) throw new Error(r.reason);
  let j;
  try { j = JSON.parse(r.text); } catch { throw new Error('report feed is not JSON'); }
  const areas = arr(j?.facilities?.areas?.area); // winter areas only (summer lifts live under j.summer)
  if (!areas.length) throw new Error('feed has no lift areas');
  const seen = new Set(), lifts = [];
  for (const l of areas.flatMap(a => arr(a?.lifts?.lift))) {
    const name = String(l?.name || '').trim();
    if (!name || seen.has(name) || /tub(e|ing)/i.test(name)) continue;
    seen.add(name);
    let status = normStatus(l.status);
    // Both fields must agree before a lift is called open.
    if (status === 'open' && l.statusIcon && String(l.statusIcon).toLowerCase() !== 'open') status = normStatus(String(l.statusIcon).replace(/-/g, ' '));
    lifts.push({ name, status });
  }
  if (!lifts.length) throw new Error('feed lists no lifts');
  const comments = arr(j?.comments?.comment).map(c => ({ title: text(c.title), body: text(String(c.text ?? '').replace(/<(br|\/p|\/h\d|\/li|\/div)\b[^>]*>/gi, '$& ')) })).filter(c => c.body);
  const all = comments.map(c => `${c.title}. ${c.body}`).join(' ');
  const note = openingNote(all);
  const main = comments[0];
  return {
    lifts,
    seasonNote: note, openingDate: openingDate(note),
    reportUpdated: j.liftsUpdated || j.updated || null,
    news: main ? [{ title: main.title || 'Mountain report', date: j.commentsUpdated || j.updated || null, excerpt: clip(main.body, 220), url: pageUrl }] : [],
  };
}
