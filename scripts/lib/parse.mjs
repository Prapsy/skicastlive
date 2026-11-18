// Shared helpers for source adapters.
import * as cheerio from 'cheerio';
export { cheerio };

/** Map a resort's own wording to one of: open | closed | hold | scheduled. Unknown wording => closed (never guess "open"). */
export function normStatus(s) {
  const t = String(s ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(hold|standby|delayed|wind)\b/.test(t)) return 'hold';
  if (/\b(scheduled|expected|planned|opening soon|forecast|anticipated)\b/.test(t)) return 'scheduled';
  if (/\b(closed|close|no|off|not open|not operating|down)\b/.test(t)) return 'closed';
  if (/^(open|yes|on|operating|running|open for the day|weekends only open)$/.test(t) || /^open\b/.test(t)) return 'open';
  return 'closed';
}

export const text = html => cheerio.load(`<div>${html ?? ''}</div>`).text().replace(/\s+/g, ' ').trim();
export const clip = (s, n = 180) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…'; };

/** Pull the sentence where a resort states its opening day, if any. Returned verbatim (short) and attributed in the UI. */
export function openingNote(body) {
  const t = String(body ?? '').replace(/\s+/g, ' ');
  const m = t.match(/[^.!?]{0,90}\b(opening day|opening date|open(?:s|ing)? for the (?:\d{2,4}[-/]\d{2,4} )?season|projected opening|plan(?:s|ning)? to open|scheduled to open|target(?:ed|ing)? opening|re-?open(?:s|ing)?)\b[^.!?]{0,110}\b(?:Jan|Feb|Mar|Nov|Dec)[a-z]*\.? \d{1,2}(?:st|nd|rd|th)?[^.!?]{0,40}[.!?]?/i);
  if (!m) return null;
  let q = m[0].trim();
  if (!/[.!?]$/.test(q)) q = q.replace(/\s+\S*$/, '') + '…'; // the match can stop mid-word; end on a whole word
  return clip(q, 200);
}

/** Try to turn an opening note into an ISO date (current ski season). Returns null if unsure. */
export function openingDate(note, now = new Date()) {
  const m = String(note ?? '').match(/\b(Jan|Feb|Mar|Nov|Dec)[a-z]*\.? (\d{1,2})(?!\d)/i);
  if (!m) return null;
  const month = { jan: 0, feb: 1, mar: 2, nov: 10, dec: 11 }[m[1].toLowerCase()];
  let year = now.getFullYear();
  if (month <= 2 && now.getMonth() >= 6) year += 1;
  const d = new Date(Date.UTC(year, month, +m[2]));
  if (d.getTime() < now.getTime() - 36e5 * 24) return null; // date already passed: don't present it as upcoming
  return d.toISOString().slice(0, 10);
}
