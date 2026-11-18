// For areas that publish no per-lift list, only a plain statement about the whole area (e.g. "Closed for the season").
// Returns no lifts. closedForSeason is set only when the element at opts.sel says so in the resort's own words;
// otherwise nothing is claimed (the site shows "unknown" and links to the resort).
//   opts.sel   CSS selector of the statement      opts.re   regex it must match (default: closed for the ... season)
//   opts.note  CSS selector of the written report (optional)
import { text } from '../lib/parse.mjs';
import { load, pageText, squash, rx, notes } from './_shared.mjs';

export default async function closedflag({ url, pageUrl, get, opts = {} }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason || 'page not available');
  const $ = load(r.text);
  const els = $(opts.sel || 'body').toArray();
  if (!els.length) throw new Error('status statement not found on page');
  const re = rx(opts.re || 'closed for (the )?(\\d{4}(-\\d{2,4})? )?(winter )?season');
  const said = els.some(e => re.test(squash($(e).text())));
  const reportText = opts.note ? text(($(opts.note).first().html() || '').replace(/</g, ' <')) : '';
  return { lifts: [], closedForSeason: said, ...notes({ reportText, bodyText: pageText($), pageUrl }) };
}
