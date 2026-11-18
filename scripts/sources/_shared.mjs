// Helpers shared by the small-area adapters (htmlrows, bousquet, sheetcsv, closedflag). Not an adapter itself.
import { cheerio, clip, openingNote, openingDate } from '../lib/parse.mjs';

export const squash = s => String(s ?? '').replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
export const rx = (s, flags = 'i') => (s instanceof RegExp ? s : new RegExp(s, flags));
export const NOT_A_LIFT = /\b(tub(e|ing)|uphill|toboggan)\b/i;

/** Load a page for parsing: scripts/styles dropped so .text() is only what a visitor reads. */
export function load(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,template').remove();
  return $;
}

/** Visible page text without navigation chrome (for opening-day notes). */
export function pageText($) {
  const c = $.root().clone();
  c.find('nav,header,footer,[role=navigation],.menu,.sub-menu').remove();
  return squash(c.text());
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/**
 * Find a calendar date in a short "last updated" string. Returns a Date at 12:00 UTC of that day, or null.
 * Understands 2026-03-15, 03/28/26, 09 / 09 / 2026, March 23, 2026, 16 March 2026 and (no year) Sep 22.
 * US month/day order is assumed for slashed dates (all sources are New England ski areas).
 */
export function findDate(s, now = new Date()) {
  const t = squash(s);
  const mk = (y, m, d) => {
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, m, d, 12));
    return dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : null;
  };
  let m;
  if ((m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/))) return mk(+m[1], +m[2] - 1, +m[3]);
  if ((m = t.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4}|\d{2})\b/))) return mk(+m[3], +m[1] - 1, +m[2]);
  if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i))) return mk(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2})\b/i))) return mk(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if ((m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i))) {
    // No year given: the most recent such day that is not in the future.
    let d = mk(now.getUTCFullYear(), MONTHS[m[1].toLowerCase()], +m[2]);
    if (d && d.getTime() > now.getTime() + 36e5 * 24) d = mk(now.getUTCFullYear() - 1, MONTHS[m[1].toLowerCase()], +m[2]);
    return d;
  }
  return null;
}

/** True when a report date is too old to trust an "open" in it. */
export const isStale = (date, maxAgeDays = 2, now = new Date()) => !date || now.getTime() - date.getTime() > (maxAgeDays + 0.5) * 864e5;

/** If the area is not operating (said so, or the report is old), no lift may be shown as running. */
export const forceClosed = lifts => lifts.map(l => ({ ...l, status: 'closed' }));

/** Season note + optional news blurb from the resort's own report text. */
export function notes({ reportText, bodyText, pageUrl, date }) {
  const seasonNote = openingNote(reportText) || openingNote(bodyText);
  const out = { seasonNote, openingDate: openingDate(seasonNote) };
  if (reportText && reportText.length >= 40) out.news = [{ title: 'Snow report', date: date ? date.toISOString().slice(0, 10) : null, excerpt: clip(reportText, 220), url: pageUrl }];
  return out;
}
