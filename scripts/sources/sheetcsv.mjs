// Lift list kept in a Google Sheet that the resort publishes and embeds on its report page (Whaleback).
// `url` is the sheet's own "publish to web" CSV link. Layout: a header row "Lifts | Open | Notes", then one row per lift
// with a one-letter mark; the sheet's own key says O = Open, X = Closed. Only the exact open mark counts as open.
//   opts.header   regex for the header cell that starts the lift block (default '^lifts$')
//   opts.open     regex for the mark meaning open (default '^o(pen)?$')
import { clip } from '../lib/parse.mjs';
import { squash, rx, NOT_A_LIFT, forceClosed, notes } from './_shared.mjs';

function csv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(squash));
}

export default async function sheetcsv({ url, pageUrl, get, opts = {} }) {
  const r = await get(url, { accept: 'text/csv,*/*;q=0.5' });
  if (!r.ok) throw new Error(r.reason || 'sheet not available');
  if (/^\s*</.test(r.text)) throw new Error('sheet did not return CSV');
  const rows = csv(r.text);
  const header = rx(opts.header || '^lifts$'), open = rx(opts.open || '^o(pen)?$');
  const h = rows.findIndex(row => row.some(c => header.test(c)));
  if (h < 0) throw new Error('lift block not found in sheet');
  const nameCol = rows[h].findIndex(c => header.test(c));
  const statusCol = rows[h].findIndex((c, i) => i > nameCol && /^(open|status)$/i.test(c));
  if (statusCol < 0) throw new Error('lift status column not found in sheet');
  const lifts = [];
  for (const row of rows.slice(h + 1)) {
    const name = row[nameCol], mark = row[statusCol] ?? '';
    if (!name) break;            // blank line ends the block
    if (!mark) continue;         // a remark line, not a lift
    if (NOT_A_LIFT.test(name)) continue;
    lifts.push({ name, status: open.test(mark) ? 'open' : 'closed' });
  }
  if (!lifts.length) throw new Error('no lift rows found in sheet');
  const banner = rows.slice(0, h).flat().filter(c => c.length > 3).join(' · ');
  const closedSaid = /closed for (the )?season/i.test(rows.slice(0, 3).flat().join(' '));
  const top = rows[0]?.find(c => c.length > 3 && !/^\d/.test(c)) || '';
  return {
    lifts: closedSaid ? forceClosed(lifts) : lifts,
    ...notes({ reportText: '', bodyText: banner, pageUrl }),
    news: top ? [{ title: 'Trail report', date: null, excerpt: clip(top, 220), url: pageUrl }] : [],
  };
}
