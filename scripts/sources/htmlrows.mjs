// Generic adapter for small ski areas whose report page is plain HTML: a list of lifts, each with a name and a status.
// Everything site-specific lives in `opts` (see config.groupB.mjs). Three layouts:
//
//   mode 'rows' (default)  one element per lift holding both the name and the status
//     scope       CSS selector of the container(s) to look in (default 'body')
//     scopeMatch  regex; only containers whose text STARTS with a match are used (e.g. '^Lifts')
//     row         CSS selector of a lift row inside the scope (default 'tr')
//     name        where the name is: child index (0, -1 ...), CSS selector, '' for the row itself, or an array to join
//     status      where the status is: child index or CSS selector, or an array of them (lift is open if any says open,
//                 e.g. separate day / night columns)
//     start/stop  regex on row text: only rows after a `start` row and before a `stop` row are lifts
//   mode 'pairs'    a flat run of elements: name, status, name, status ... between a `start` and a `stop` element
//     item        CSS selector of the elements;  start / stop  regex on an element's whole text
//   mode 'columns'  one column of names beside one column of statuses (paired by position)
//     col, head, item  CSS selectors (column, its heading, its entries);  nameHead / statusHead  regex on the heading
//
// Status reading (all modes):
//     statusFrom  'text' (default: the site's own word through normStatus), 'class' (CSS classes of the status element
//                 and what is inside it) or 'img' (image file names + alt text). For class/img give
//     map         { open, closed, hold, scheduled } regexes. Open needs a positive `open` match and no `closed` match.
//     strict      true: drop rows whose status is not a recognisable status word (keeps non-lift rows out)
//     skip        regex of names to leave out (default: tubing, uphill routes, toboggan)
//     nameClean   regex of remarks to cut out of names
// Safety (so last season's table is never shown as running lifts):
//     season      { sel, re }  if any element matching `sel` has text matching `re`, the area says it is closed
//     updated     { sel, re?, maxAgeDays?, stale? }  the report's own date; older than maxAgeDays (default 2) => all closed
//                 (stale:false = only pass the date on, do not judge by it)
// Report text:
//     note        CSS selector of the resort's written report (opening-day note + news blurb)
import { normStatus, text } from '../lib/parse.mjs';
import { load, pageText, squash, rx, NOT_A_LIFT, findDate, isStale, forceClosed, notes } from './_shared.mjs';

const STATUS_WORD = /\b(open|opened|clos(e|ed)|hold|standby|delayed|scheduled|expected|yes|no)\b/i;
const RANK = ['open', 'hold', 'scheduled', 'closed'];

export default async function htmlrows({ url, pageUrl, get, opts = {} }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason || 'page not available');
  const $ = load(r.text);
  const o = { mode: 'rows', scope: 'body', row: 'tr', name: 0, status: 1, statusFrom: 'text', ...opts };
  const skip = o.skip ? rx(o.skip) : NOT_A_LIFT;

  // --- how one status element is read ---
  const readStatus = el => {
    if (!el || !el.length) return { status: 'closed', raw: '' };
    if (o.statusFrom === 'text') { const raw = squash(el.text()); return { status: normStatus(raw), raw }; }
    const nodes = el.add(el.find('*'));
    const raw = o.statusFrom === 'class'
      ? nodes.map((_, n) => $(n).attr('class') || '').get().join(' ')
      : nodes.filter('img').map((_, n) => `${($(n).attr('src') || '').split('/').pop()} ${$(n).attr('alt') || ''}`).get().join(' ');
    const m = o.map || {};
    const hit = k => m[k] && rx(m[k]).test(raw);
    const status = hit('hold') ? 'hold' : hit('closed') ? 'closed' : hit('open') ? 'open' : hit('scheduled') ? 'scheduled' : 'closed';
    return { status, raw };
  };
  const pick = (row, where) => {
    if (where === '') return row;
    if (typeof where === 'number') { const kids = row.children(); return kids.eq(where < 0 ? kids.length + where : where); }
    return row.find(where).first();
  };
  const best = list => RANK.find(s => list.includes(s)) || 'closed';

  // --- collect lifts ---
  let scopes = $(o.scope);
  if (o.scopeMatch) scopes = scopes.filter((_, e) => rx('^\\s*(?:' + o.scopeMatch.replace(/^\^/, '') + ')').test(squash($(e).text()).slice(0, 80)));
  const lifts = [], seen = new Set(), rowEls = [];
  const add = (name, status, raw) => {
    if (o.nameClean) name = name.replace(rx(o.nameClean, 'gi'), ' ');
    name = squash(name).replace(/[:\s]+$/, '');
    if (!name || name.length > 80 || skip.test(name) || seen.has(name.toLowerCase())) return;
    if (o.strict && !STATUS_WORD.test(raw)) return;
    seen.add(name.toLowerCase());
    lifts.push({ name, status });
  };

  if (o.mode === 'rows') {
    let on = !o.start;
    scopes.find(o.row).each((_, e) => {
      const row = $(e), txt = squash(row.text());
      if (o.stop && on && rx(o.stop).test(txt)) { on = false; return; }
      if (o.start && rx(o.start).test(txt)) { on = true; return; }
      if (!on) return;
      const name = [].concat(o.name).map(w => squash(pick(row, w).text())).filter(Boolean).join(' ')
        .replace(/\b(\w+)\s+(?=\1\b)/gi, ''); // "DOUBLE Double Chairlift" -> "Double Chairlift"
      const st = [].concat(o.status).map(w => readStatus(pick(row, w)));
      if (!st.some(s => s.raw)) return; // header or spacer row with no status at all
      rowEls.push(e);
      add(name, best(st.map(s => s.status)), st.map(s => s.raw).join(' '));
    });
  } else if (o.mode === 'pairs') {
    let on = false, pending = null;
    const isStatus = t => t.length <= 20 && STATUS_WORD.test(t);
    scopes.find(o.item).each((_, e) => {
      const t = squash($(e).text());
      if (!on) { if (rx(o.start).test(t)) on = true; return; }
      if (o.stop && rx(o.stop).test(t)) { on = false; return false; }
      if (!t) return;
      if (isStatus(t)) { if (pending) add(pending, normStatus(t), t); pending = null; }
      else pending = t; // a name with no status after it is dropped: nothing was said about it
    });
  } else if (o.mode === 'columns') {
    const cols = scopes.find(o.col).toArray().map(c => ({ head: squash($(c).find(o.head).first().text()), items: $(c).find(o.item).toArray().map(i => squash($(i).text())) }));
    const ni = cols.findIndex(c => rx(o.nameHead).test(c.head));
    const sc = ni < 0 ? null : cols.slice(ni + 1).find(c => rx(o.statusHead).test(c.head));
    if (!sc) throw new Error('lift columns not found on page');
    if (cols[ni].items.length !== sc.items.length) throw new Error('lift names and statuses do not line up');
    cols[ni].items.forEach((n, i) => add(n, normStatus(sc.items[i]), sc.items[i]));
  } else throw new Error('unknown htmlrows mode ' + o.mode);

  if (!lifts.length) throw new Error('no lift rows found on page');

  // --- is the area actually operating? ---
  const outside = sel => $(sel).filter((_, e) => !rowEls.some(row => row === e || $.contains(row, e)));
  let closedSaid = false, date = null, stale = false;
  if (o.season) closedSaid = outside(o.season.sel).toArray().some(e => rx(o.season.re || 'closed for (the )?(\\d{4}(-\\d{2,4})? )?(winter )?season').test(squash($(e).text())));
  if (o.updated) {
    const t = $(o.updated.sel).toArray().map(e => squash($(e).text())).join(' ');
    const m = o.updated.re ? t.match(rx(o.updated.re)) : [t];
    date = m ? findDate(m[1] ?? m[0]) : null;
    if (o.updated.stale !== false) stale = isStale(date, o.updated.maxAgeDays ?? 2);
  }
  const reportText = o.note ? text(($(o.note).first().html() || '').replace(/</g, ' <')) : '';
  return {
    lifts: closedSaid || stale ? forceClosed(lifts) : lifts,
    reportUpdated: date ? date.toISOString() : null,
    ...notes({ reportText, bodyText: pageText($), pageUrl, date }),
  };
}
