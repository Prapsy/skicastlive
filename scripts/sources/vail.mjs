// Vail Resorts sites embed FR.TerrainStatusFeed = {...} in the lift & terrain status page.
// Status codes come from the page's own FR.LiftStatusFilters legend.
const CODES = { 0: 'closed', 1: 'open', 2: 'hold', 3: 'scheduled', 4: 'closed' };
export default async function vail({ url, get }) {
  const r = await get(url);
  if (!r.ok) throw new Error(r.reason);
  const m = r.text.match(/FR\.TerrainStatusFeed\s*=\s*(\{.*?\});\s*(?:FR\.|<\/script>)/s);
  if (!m) throw new Error('terrain feed not found on page');
  const feed = JSON.parse(m[1]);
  const seen = new Set(), lifts = [];
  for (const l of [...(feed.Lifts || []), ...(feed.GroomingAreas || []).flatMap(a => a.Lifts || [])]) {
    const name = String(l.Name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const s = typeof l.Status === 'number' ? CODES[l.Status] : String(l.Status || '').toLowerCase();
    lifts.push({ name, status: ['open', 'closed', 'hold', 'scheduled'].includes(s) ? s : 'closed' });
  }
  // Out of season the feed lists no lifts at all: that is the resort reporting nothing running.
  // Resort-measured snowfall lives on the sibling snow report page (best effort).
  let resortSnow = null;
  try {
    const snowUrl = url.replace(/[^/]+\.aspx$/, 'snow-and-weather-report.aspx');
    const s = await get(snowUrl);
    const sm = s.ok && s.text.match(/FR\.snowReportData\s*=\s*(\{.*?\});/s);
    if (sm) {
      const d = JSON.parse(sm[1]), n = v => (v?.Inches != null && /^\d+(\.\d+)?$/.test(String(v.Inches)) ? +v.Inches : null);
      resortSnow = { last24In: n(d.TwentyFourHourSnowfall), last48In: n(d.FortyEightHourSnowfall), last7dIn: n(d.SevenDaySnowfall),
        baseDepthIn: n(d.BaseDepth), seasonIn: n(d.CurrentSeason), updated: d.LastUpdatedText || null };
    }
  } catch { /* snow totals are optional */ }
  return { lifts, closedForSeason: lifts.length === 0, resortSnow };
}
