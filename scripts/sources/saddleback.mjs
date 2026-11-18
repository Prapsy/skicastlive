// Saddleback: the mountain report page fills itself from https://saddlebackapi.netlify.app/.netlify/functions/getAll
// (the page's own `mountainReportData`). Lifts carry a Lumiplan-style openingStatus:
//   OPEN | FORECAST (expected to run today, not yet confirmed) | STOPPED / DELAYED | CLOSED | OUT_OF_PERIOD (out of season).
// The resort's page counts FORECAST as open; we report it as 'scheduled'.
import { blockText, cleanLifts, reportExtras } from './_groupA.mjs';
const MAP = { OPEN: 'open', FORECAST: 'scheduled', STOPPED: 'hold', DELAYED: 'hold', CLOSED: 'closed', OUT_OF_PERIOD: 'closed' };
export default async function saddleback({ url, get, pageUrl }) {
  const r = await get(url, { accept: 'application/json' });
  if (!r.ok) throw new Error(r.reason);
  let d;
  try { d = JSON.parse(r.text)?.data; } catch { throw new Error('report feed is not JSON'); }
  if (!d?.lifts || typeof d.lifts !== 'object') throw new Error('feed has no lift data');
  const lifts = cleanLifts(Object.values(d.lifts)
    .filter(l => l && (!l.type || l.type === 'SKI_LIFT'))
    .map(l => ({ name: l.name, status: MAP[String(l.openingStatus ?? '').toUpperCase()] ?? 'closed' })));
  if (!lifts.length) throw new Error('feed lists no lifts');
  const report = blockText(typeof d.mountainReport === 'string' ? d.mountainReport : '');
  return { lifts, reportUpdated: d.respTimestamp ?? null, ...reportExtras(report, { title: 'Mountain report', date: d.respTimestamp ?? null, pageUrl }) };
}
