// Cranmore: server-rendered page. <h2>Lifts</h2> is followed by div.datatable whose rows are
//   div.row > div.col (name) + div.col > span.status.<open|closed> (text "open" | "closed")
// The site's stylesheet defines exactly .status.open and .status.closed. Rows after the "Tubing and Rides" sub-heading are skipped.
import { cheerio, normStatus } from '../lib/parse.mjs';
import { blockText, cleanLifts, reportExtras, parseStamp } from './_groupA.mjs';
export default async function cranmore({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const table = $('h2').filter((_, e) => /^\s*lifts\s*$/i.test($(e).text())).first().nextAll('.datatable').first();
  if (!table.length) throw new Error('lift table not found on page');
  const raw = [];
  let skip = false;
  table.children('.row').each((_, row) => {
    const $row = $(row);
    if ($row.find('h3').length) { skip = !/lift/i.test($row.text()); return; } // sub-heading such as "Tubing and Rides"
    const st = $row.find('span.status').first();
    if (skip || !st.length) return;
    const cls = String(st.attr('class') ?? '').split(/\s+/), label = normStatus(st.text());
    const status = label === 'open' ? (cls.includes('open') && !cls.includes('closed') ? 'open' : 'closed') : label;
    raw.push({ name: $row.children('.col').first().text(), status });
  });
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift table is empty');
  // Report text sits between "Last Updated:" and the conditions summary in the same section.
  const sec = table.closest('section').clone();
  sec.find('.datatable, .conditions, h1, h2, h3, script, style').remove();
  const body = blockText(sec.html());
  const stamp = body.match(/Last Updated:\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/i);
  const report = body.replace(/^.*?\bReport:\s*/i, '').trim();
  const updated = stamp ? parseStamp(stamp[1]) : null;
  return { lifts, reportUpdated: updated, ...reportExtras(report, { title: 'Snow report', date: updated, pageUrl }) };
}
