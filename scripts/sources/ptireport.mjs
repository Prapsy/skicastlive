// "SnowReport" conditions widget used by Gunstock (in the page) and by Bolton Valley, Jay Peak, King Pine and Waterville Valley
// (in an iframe on a conditions.* / snow.* / digital.* host of the resort). Markup:
//   section.SnowReport-section--lifts > article.SnowReport-Lift
//     h3.SnowReport-feature-title                          lift name
//     .SnowReport-item-type  .SnowReport-sr-label          Quad | Double | Surface Lift | Tuber Tow ...
//     .SnowReport-item-status i.pti.pti-<state> + .SnowReport-sr-label
// The widget's own legend gives the states: pti-open "Open", pti-closed "Closed", pti-hold "On Hold" / "Wind Delay", pti-hold-check "On Hold", pti-on-delay "Delay Opening".
// A lift is 'open' only when the icon class is exactly pti-open and the label does not disagree.
import { cheerio, normStatus } from '../lib/parse.mjs';
import { blockText, cleanLifts, reportExtras, parseStamp } from './_groupA.mjs';

function liftStatus(iconClass, label) {
  const cls = String(iconClass ?? '').split(/\s+/);
  const byLabel = label ? normStatus(label) : null;
  if (cls.some(c => /^pti-(on-)?(hold|delay)/.test(c))) return 'hold'; // pti-hold, pti-hold-check, pti-on-delay
  if (cls.includes('pti-closed')) return 'closed';
  if (cls.includes('pti-open')) return byLabel == null || byLabel === 'open' ? 'open' : byLabel;
  return byLabel && byLabel !== 'open' ? byLabel : 'closed'; // unknown icon: never guess open
}

export default async function ptireport({ url, get, pageUrl }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const $ = cheerio.load(r.text);
  const raw = [];
  $('section.SnowReport-section--lifts article.SnowReport-Lift, section.SnowReport-section--lifts .SnowReport-Lift').each((_, el) => {
    const $el = $(el);
    const type = $el.find('.SnowReport-item-type .SnowReport-sr-label').first().text().trim();
    if (/tub(e|er|ing)/i.test(type)) return; // tubing tows are not ski lifts
    const st = $el.find('.SnowReport-item-status').first();
    raw.push({ name: $el.find('.SnowReport-feature-title').first().text(), status: liftStatus(st.find('i').attr('class'), st.find('.SnowReport-sr-label').text().trim()) });
  });
  if (!$('.SnowReport').length && !$('[class*="SnowReport-section"]').length) throw new Error('snow report widget not found on page');
  const lifts = cleanLifts(raw);
  if (!lifts.length) throw new Error('snow report lists no lifts');
  const written = blockText($('.SnowReport-section--written article').first().html() ?? $('.SnowReport-section--written').first().html());
  const updated = parseStamp($('.date-info, .update-info').first().text());
  return { lifts, reportUpdated: updated, ...reportExtras(written, { title: 'Snow report', date: updated, pageUrl }) };
}
