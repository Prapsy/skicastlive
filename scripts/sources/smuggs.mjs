// Smugglers' Notch: server-rendered tables, one per mountain, captioned "<Mountain> Lifts":
//   tr.facility-report_item > .facility-report_title (name)
//                           > td.facility-report_status > span.screen-reader-text ("Open" | "Closed") + span.facility-report_icon.--status.--open|--closed
// The --open / "Open" pair is confirmed by rows on the same page (uphill access routes shown open).
import { cheerio, normStatus } from '../lib/parse.mjs';
import { cleanLifts, reportExtras, parseStamp } from './_groupA.mjs';
export default async function smuggs({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const tables = $('table.facility-table').filter((_, t) => /\blifts?\s*$/i.test($(t).find('caption').text().trim()));
  if (!tables.length) throw new Error('lift tables not found on page');
  const raw = [];
  tables.find('tr.facility-report_item').each((_, tr) => {
    const cell = $(tr).find('.facility-report_status').first();
    const label = normStatus(cell.find('.screen-reader-text').first().text() || cell.find('.facility-report_icon').attr('title'));
    const cls = String(cell.find('.facility-report_icon').attr('class') ?? '').split(/\s+/);
    const status = label === 'open' ? (cls.includes('--open') && !cls.includes('--closed') ? 'open' : 'closed') : label;
    raw.push({ name: $(tr).find('.facility-report_title').first().text(), status });
  });
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift tables are empty');
  const after = label => $('p').filter((_, p) => new RegExp('^\\s*' + label, 'i').test($(p).text())).first().next('p').text().replace(/\s+/g, ' ').trim();
  const message = after('Daily Message'), updated = parseStamp(after('Report Last Updated'));
  return { lifts, reportUpdated: updated, ...reportExtras(message, { title: 'Daily message', date: updated, pageUrl }) };
}
