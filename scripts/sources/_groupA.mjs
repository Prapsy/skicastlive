// Small helpers shared by the group A adapters (not an adapter itself).
import { cheerio, text, clip, openingNote, openingDate } from '../lib/parse.mjs';

export const arr = x => (Array.isArray(x) ? x : x ? [x] : []);

/** Like text(), but keeps a space where block elements end so sentences do not run together. */
export const blockText = html => text(String(html ?? '').replace(/<(br|\/p|\/h\d|\/li|\/div|\/tr|\/td)\b[^>]*>/gi, '$& '));

/** Parse the Next.js __NEXT_DATA__ blob of a page; returns pageProps or throws. */
export function nextPageProps(html) {
  const raw = cheerio.load(html)('script#__NEXT_DATA__').first().text();
  if (!raw) throw new Error('page data (__NEXT_DATA__) not found');
  try { return JSON.parse(raw)?.props?.pageProps ?? {}; } catch { throw new Error('page data is not valid JSON'); }
}

/** Not a lift people ski from: tubing / summer attractions. */
export const notSkiLift = name => /\btub(e|es|ing)\b|\bzip ?line\b|\bcoaster\b/i.test(name);

/** De-duplicate by name, drop empties and tubing lifts, force status into the four allowed values. */
export function cleanLifts(list) {
  const seen = new Set(), out = [];
  for (const l of list) {
    const name = String(l?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || notSkiLift(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, status: ['open', 'closed', 'hold', 'scheduled'].includes(l.status) ? l.status : 'closed' });
  }
  return out;
}

/** Common tail of a result: season note + one news item from the resort's report blurb (plain text). */
export function reportExtras(reportText, { title = 'Snow report', date = null, pageUrl, noteText } = {}) {
  const body = String(reportText ?? '').replace(/\s+/g, ' ').trim();
  const note = openingNote(noteText ?? body);
  return {
    seasonNote: note, openingDate: openingDate(note),
    news: body ? [{ title, date, excerpt: clip(body, 220), url: pageUrl }] : [],
  };
}

/** Wall-clock time in a time zone -> ISO string (UTC). Returns null if the parts are not a real date. */
export function zonedISO(y, mo, d, h = 0, mi = 0, tz = 'America/New_York') {
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (isNaN(guess)) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(new Date(guess)).map(p => [p.type, +p.value]));
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess + (guess - shown)).toISOString();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Parse "11/17/2026 10:24am" or "08:15am, April 22, 2026" style stamps (resort local time). Null when unsure. */
export function parseStamp(s, tz = 'America/New_York') {
  const t = String(s ?? '').replace(/\s+/g, ' ');
  const time = t.match(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\b/i);
  const h = time ? (+time[1] % 12) + (/p/i.test(time[3]) ? 12 : 0) : 12, mi = time ? +time[2] : 0;
  let m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return zonedISO(+m[3], +m[1], +m[2], h, mi, tz);
  m = t.match(/\b([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/);
  if (m && MONTHS.includes(m[1].toLowerCase())) return zonedISO(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2], h, mi, tz);
  return null;
}
