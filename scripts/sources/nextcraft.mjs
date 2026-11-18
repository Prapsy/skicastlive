// Cannon and Bromley: Next.js pages (Craft CMS behind them) that embed the whole report in __NEXT_DATA__.
//   cannon:  pageProps.data.trailsLiftsEntries[0].lifts[] = { title, liftStatus }   liftStatus: open | onHold | pendingInspection | closed
//            trailsLiftsEntries[0].toggleAllOverride = true makes the site show every lift closed.
//   bromley: pageProps.report.lifts[] = { name, status, scheduledOpen, scheduledClose }   status: open | onHold | scheduled | closed
// Values were read from each site's own page script (the code that picks the open / hold / closed icon).
// Bromley's page draws a "scheduled" lift as open while the clock is inside its scheduled hours; we keep it as
// 'scheduled' (not confirmed running) unless opts.scheduledInHoursIsOpen is set.
import { arr, blockText, nextPageProps, cleanLifts, reportExtras } from './_groupA.mjs';

const MAP = { open: 'open', onhold: 'hold', pendinginspection: 'hold', scheduled: 'scheduled', closed: 'closed' };
const norm = s => MAP[String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')] ?? 'closed';
const hm = (iso, tz) => { const d = new Date(iso); if (isNaN(d)) return null;
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number); return h * 60 + m; };

export default async function nextcraft({ url, get, pageUrl, opts = {} }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const pp = nextPageProps(r.text);
  const tz = opts.timeZone || 'America/New_York';
  let raw, copy, title, updated;
  const tl = arr(pp?.data?.trailsLiftsEntries)[0];
  if (tl && Array.isArray(tl.lifts)) { // Cannon shape
    const allClosed = tl.toggleAllOverride === true;
    raw = tl.lifts.map(l => ({ name: l.title, status: allClosed ? 'closed' : norm(l.liftStatus) }));
    const rep = arr(pp?.data?.mountainReportEntries)[0] ?? {};
    copy = blockText(rep.copy); updated = rep.dateUpdated ?? null; title = 'Mountain report';
  } else { // Bromley shape
    const rep = pp?.report ?? pp?.data?.entry;
    if (!rep || !Array.isArray(rep.lifts)) throw new Error('lift list not found in page data');
    const now = hm(new Date().toISOString(), tz);
    raw = rep.lifts.map(l => {
      let status = norm(l.status);
      if (status === 'scheduled' && opts.scheduledInHoursIsOpen) {
        const a = hm(l.scheduledOpen, tz), b = hm(l.scheduledClose, tz);
        if (a != null && b != null && now > a && now < b) status = 'open';
      }
      return { name: l.name, status };
    });
    copy = rep.reportComments?.plainText ? String(rep.reportComments.plainText) : blockText(rep.reportComments?.html);
    updated = rep.dateUpdated ?? null; title = 'Snow report';
  }
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('page data lists no lifts');
  return { lifts, reportUpdated: updated, ...reportExtras(copy, { title, date: updated, pageUrl }) };
}
