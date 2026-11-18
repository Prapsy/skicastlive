// Burke: server-rendered tables (YOOtheme). The lift table is the one whose header starts with "Lift Name";
// each row is <td> name </td><td> <span class="uk-text-danger" uk-icon="icon: bootstrap-filled--x-square"> </td>.
// Only the closed marker (red x-square) has been seen on the live page. An open lift is accepted only as a green
// (uk-text-success) check icon; any other marker makes the adapter fail rather than guess.
import { cheerio } from '../lib/parse.mjs';
import { cleanLifts } from './_groupA.mjs';
export default async function burke({ url, get }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const table = $('table').filter((_, t) => /^\s*lift name/i.test($(t).find('thead').text())).first();
  if (!table.length) throw new Error('lift table not found on page');
  const raw = [];
  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).children('td');
    const name = tds.first().text().replace(/\s+/g, ' ').trim();
    if (!name) return;
    const icon = tds.slice(1).find('[uk-icon]').first();
    const cls = String(icon.attr('class') ?? ''), ic = String(icon.attr('uk-icon') ?? '').toLowerCase(), txt = tds.slice(1).text().trim().toLowerCase();
    let status;
    if (/uk-text-danger/.test(cls) && /x-|close|times|ban/.test(ic)) status = 'closed';
    else if (/uk-text-success/.test(cls) && /check/.test(ic)) status = 'open';
    else if (/\bhold\b/.test(txt) || (/uk-text-warning/.test(cls) && /pause|exclamation|clock|hourglass/.test(ic))) status = 'hold';
    else if (/^closed$/.test(txt)) status = 'closed';
    else throw new Error(`unrecognised lift status marker for "${name}" (${cls} ${ic} ${txt})`.replace(/\s+/g, ' '));
    raw.push({ name, status });
  });
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift table is empty');
  return { lifts };
}
