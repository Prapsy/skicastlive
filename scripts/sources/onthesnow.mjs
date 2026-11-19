// OnTheSnow regional snow-report pages: one request per state / province gives every resort's
// open flag, lifts and runs open, snow depth and projected opening. Used to fill in mountains whose
// own site we cannot read. Data is credited to OnTheSnow in the UI and linked back to their report.
const ORIGIN = 'https://www.onthesnow.com';
export const regionUrl = slug => `${ORIGIN}/${slug}/skireport`;
export const resortUrl = (region, slug) => `${ORIGIN}/${region}/${slug}/skireport`;

/** Decode the page's embedded React stream into a map of row id -> value (rows that are not JSON are skipped). */
export function flightRows(html) {
  let stream = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { stream += JSON.parse(m[1]); } catch { /* not a string chunk */ }
  }
  const rows = new Map();
  const starts = [...stream.matchAll(/(?:^|\n)([0-9a-f]{1,5}):/g)];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i].index + starts[i][0].length;
    const e = i + 1 < starts.length ? starts[i + 1].index : stream.length;
    const body = stream.slice(s, e).trim();
    if (body[0] !== '{' && body[0] !== '[') continue;
    try { rows.set(starts[i][1], JSON.parse(body)); } catch { /* row spans text we do not need */ }
  }
  return rows;
}

function resolve(v, rows, depth = 0) {
  if (depth > 6) return null;
  if (typeof v === 'string' && /^\$[0-9a-f]{1,5}$/.test(v)) return rows.has(v.slice(1)) ? resolve(rows.get(v.slice(1)), rows, depth + 1) : null;
  if (Array.isArray(v)) return v.map(x => resolve(x, rows, depth + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, rows, depth + 1)]));
  return v;
}

const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const cmToIn = x => (num(x) == null ? null : Math.round(x / 2.54));

/** All resorts with a report on a regional page. Never guesses: fields the page omits come back null. */
export function parseRegion(html) {
  const rows = flightRows(html);
  const out = new Map();
  for (const raw of rows.values()) {
    if (!raw || Array.isArray(raw) || !raw.slug || !raw.uuid || !raw.status || !raw.lifts) continue;
    const r = resolve(raw, rows);
    if (!r.status || typeof r.status !== 'object') continue;
    const liftsOpen = num(r.lifts?.open), liftsTotal = num(r.lifts?.total);
    out.set(r.slug, {
      slug: r.slug, uuid: String(r.uuid), name: r.title, shortName: r.title_short || r.title,
      region: r.region, regionName: r.region_en, country: r.country_code,
      openFlag: num(r.status.openFlag), openingDate: r.status.openingDate ?? null, closingDate: r.status.closingDate ?? null,
      liftsOpen, liftsTotal,
      runsOpen: num(r.runs?.open), runsTotal: num(r.runs?.total), runsPct: num(r.runs?.openPercent),
      baseDepthIn: cmToIn(r.snow?.base), summitDepthIn: cmToIn(r.snow?.summit),
      last24In: cmToIn(r.snow?.last24), last48In: cmToIn(r.snow?.last48), last72In: cmToIn(r.snow?.last72),
      updatedAt: r.updatedAt ?? null,
    });
  }
  return [...out.values()];
}

/** Every resort the region lists, including ones without a current report (name + slug only). */
export function parseRegionIndex(html) {
  const rows = flightRows(html);
  const out = new Map();
  for (const raw of rows.values()) {
    if (!raw || Array.isArray(raw) || !raw.slug || !raw.uuid || !raw.title || !raw.region) continue;
    if (!out.has(raw.slug)) out.set(raw.slug, { slug: raw.slug, uuid: String(raw.uuid), name: raw.title, shortName: raw.title_short || raw.title, region: raw.region, regionName: raw.region_en, country: raw.country_code });
  }
  return [...out.values()];
}

/** Fetch one region through the polite getter. Returns { ok, resorts, reason }. */
export async function fetchRegion(get, slug) {
  const res = await get(regionUrl(slug));
  if (!res.ok) return { ok: false, resorts: [], reason: res.reason || 'unreadable' };
  const resorts = parseRegion(res.text);
  return resorts.length ? { ok: true, resorts, html: res.text } : { ok: false, resorts: [], reason: 'no resort data on page' };
}
