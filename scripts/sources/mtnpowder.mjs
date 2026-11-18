// Public resort feed at mtnpowder.com (used by Stratton and Sugarbush for their own conditions pages).
import { normStatus, text, clip, openingNote, openingDate } from '../lib/parse.mjs';
export default async function mtnpowder({ url, get, pageUrl }) {
  const r = await get(url, { accept: 'application/json' });
  if (!r.ok) throw new Error(r.reason);
  const j = JSON.parse(r.text);
  if (!j.MountainAreas) throw new Error('feed has no lift data');
  const lifts = j.MountainAreas.flatMap(a => a.Lifts || [])
    .filter(l => !/tube|tubing/i.test(l.Name))
    .map(l => ({ name: l.Name.trim(), status: normStatus(l.StatusEnglish || l.Status) }));
  const report = text(j.SnowReport?.Report);
  const note = openingNote(report);
  const sr = j.SnowReport || {}, top = sr.SummitArea || sr.MidMountainArea || sr.BaseArea || {};
  const num = v => (v != null && /^\d+(\.\d+)?$/.test(String(v).trim()) ? +v : null);
  const resortSnow = { last24In: num(top.Last24HoursIn), last48In: num(top.Last48HoursIn), last7dIn: num(top.Last7DaysIn),
    baseDepthIn: num(top.BaseIn), seasonIn: num(sr.SeasonTotalIn), updated: sr.LastUpdate || null };
  return {
    lifts, resortSnow,
    seasonNote: note, openingDate: openingDate(note),
    reportUpdated: j.SnowReport?.LastUpdate || j.LastUpdate || null,
    news: report ? [{ title: 'Snow report', date: j.SnowReport?.LastUpdate || null, excerpt: clip(report, 220), url: pageUrl }] : [],
  };
}
