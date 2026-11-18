// Magic Mountain (Wix site): the snow report page has a table with columns Lift | Open | Capacity | Type.
// The same rows are in the page's wix-warmup-data JSON ({ liftStatus: <name>, open: <text>, type, capacity }).
// "Open" is a free-text cell that is empty when the lift is closed. Out of season every cell is empty, so the
// resort's open marker has not been observed: we accept only "open"/"yes" or a check mark as open, read
// "closed"/"no"/"hold"-style words with normStatus, and fail on anything else rather than guess.
import { cheerio, normStatus } from '../lib/parse.mjs';
import { cleanLifts, reportExtras } from './_groupA.mjs';

function cellStatus(v, name) {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!t || /^[-–—]+$/.test(t)) return 'closed';
  if (/^[✓✔☑✅]+$/u.test(t)) return 'open';
  if (/^[✗✘❌🚫]+$/u.test(t)) return 'closed';
  if (/^(open|yes|closed|close|no|on hold|hold|wind hold|delayed|scheduled)\b/i.test(t)) return normStatus(t);
  throw new Error(`unrecognised lift status "${t.slice(0, 30)}" for "${name}"`);
}

export default async function magic({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const table = $('table').filter((_, t) => {
    const head = $(t).find('tr').first().find('th,td').map((_, c) => $(c).text().trim().toLowerCase()).get();
    return head[0] === 'lift' && head.includes('open');
  }).first();
  if (!table.length) throw new Error('lift table not found on page');
  const head = table.find('tr').first().find('th,td').map((_, c) => $(c).text().trim().toLowerCase()).get();
  const col = head.indexOf('open');
  const raw = table.find('tr').slice(1).map((_, tr) => {
    const cells = $(tr).find('td');
    const name = cells.eq(0).text().replace(/\s+/g, ' ').trim().replace(/\s+[\d,]+\s*(?:'|’|ft\.?|feet)$/i, ''); // drop trailing length, e.g. 5,400'
    return name ? { name, status: cellStatus(cells.eq(col).text(), name) } : null;
  }).get().filter(Boolean);
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift table is empty');
  // Snow report blurb: the rich-text block that starts with a dated update ("November 17: ...").
  const blurb = $('[data-testid="richTextElement"], .wixui-rich-text').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get()
    .find(t => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\s*:/.test(t)) ?? '';
  return { lifts, ...reportExtras(blurb, { title: 'Snow report', pageUrl }) };
}
