// Bretton Woods: server-rendered accordion. The "Lifts Operating n/m" accordion holds
//   li.js-trail-report-item[data-status="open|closed"] > .trail-reports__table-item--name / --status span ("open" | "closed")
// (the same markup, with data-status="open", is used for open trails further down the page).
import { cheerio, normStatus } from '../lib/parse.mjs';
import { blockText, cleanLifts, reportExtras } from './_groupA.mjs';
export default async function brettonwoods({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const titles = $('.accordion__title');
  const liftItem = titles.filter((_, e) => /^\s*lifts?\b/i.test($(e).text())).first().closest('.accordion__item');
  if (!liftItem.length) throw new Error('lift list not found on page');
  const raw = liftItem.find('.js-trail-report-item').map((_, e) => {
    const attr = normStatus($(e).attr('data-status')), label = normStatus($(e).find('.trail-reports__table-item--status span').first().text());
    // open only when the attribute and the visible label both say open
    return { name: $(e).find('.trail-reports__table-item--name').text(), status: attr === label ? attr : (attr === 'open' ? label : attr) };
  }).get();
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('lift list is empty');
  const comments = blockText(titles.filter((_, e) => /comments/i.test($(e).text())).first().closest('.accordion__item').find('.accordion__content').html());
  return { lifts, ...reportExtras(comments, { title: 'Alpine report', pageUrl }) };
}
