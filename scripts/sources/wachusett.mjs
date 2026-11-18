// Wachusett: server-rendered page. section#lifts holds a legend (.lifts-guide-icons: an "Open" svg and a "Closed" svg)
// and the lift list (.lifts-guide-map). Out of season the list is empty and the page says "We are closed for the season".
// When lifts are listed, each one's icon is compared with the page's own legend icons; an icon that matches neither
// makes the adapter fail rather than guess. NOTE: the in-season item markup has not been observed yet.
import { cheerio, normStatus } from '../lib/parse.mjs';
import { blockText, cleanLifts, reportExtras } from './_groupA.mjs';
const sig = ($, svg) => $(svg).find('path,circle,rect,polygon').map((_, p) => `${$(p).attr('fill') ?? ''}:${String($(p).attr('d') ?? '').replace(/\s+/g, '').slice(0, 40)}`).get().join('|');

export default async function wachusett({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const sec = $('section#lifts, .snowreportpage__lifts-section').first();
  if (!sec.length) throw new Error('lift section not found on page');
  const legend = {};
  sec.find('.lifts-guide-icons > div').each((_, d) => { const k = normStatus($(d).text()); const s = sig($, $(d).find('svg').first()); if (s) legend[s] = k; });
  const update = blockText($('h2,h3').filter((_, e) => /mountain update/i.test($(e).text())).first().parent().html()).replace(/^\s*Mountain Update\s*/i, '');
  const extras = reportExtras(update, { title: 'Mountain update', pageUrl });
  const map = sec.find('.lifts-guide-map').first();
  const items = map.children().filter((_, e) => $(e).text().trim());
  if (!items.length) {
    const pageText = $('main').text().replace(/\s+/g, ' ');
    if (/\bclosed for the (season|winter|summer)\b/i.test(pageText)) return { lifts: [], closedForSeason: true, ...extras };
    throw new Error('page lists no lifts');
  }
  const raw = items.map((_, e) => {
    const $e = $(e);
    const name = $e.clone().find('svg, .visually-hidden, .sr-only').remove().end().text().replace(/\s+/g, ' ').trim();
    const svg = $e.find('svg').first();
    const bySig = svg.length ? legend[sig($, svg)] : undefined;
    const byClass = /\b(is-)?open\b/i.test($e.attr('class') ?? '') ? 'open' : /\b(is-)?closed\b/i.test($e.attr('class') ?? '') ? 'closed' : undefined;
    const status = bySig ?? byClass;
    if (!status) throw new Error(`unrecognised lift status marker for "${name}"`);
    return { name, status };
  }).get();
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift list is empty');
  return { lifts, ...extras };
}
