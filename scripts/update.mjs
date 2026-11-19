// Data job: weather for every mountain + each resort's own lift report (OnTheSnow fills the gaps) -> public/data/snapshot.json
// Usage: node scripts/update.mjs [id ...]     SKI_CACHE=1 reads report pages from .cache/pages (parser development)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get as httpGet } from './lib/http.mjs';
import { SOURCES as BASE } from './sources/config.mjs';
import { fetchRegion, resortUrl } from './sources/onthesnow.mjs';
const extra = async f => existsSync(new URL(`./sources/${f}`, import.meta.url)) ? (await import(`./sources/${f}`)).SOURCES : {};
const SOURCES = { ...BASE, ...(await extra('config.groupA.mjs')), ...(await extra('config.groupB.mjs')) };

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root)));
const mountains = read('data/mountains.json');
const only = process.argv.slice(2);
const now = new Date();
const outDir = new URL('public/data/', root);
mkdirSync(new URL('terrain/', outDir), { recursive: true });
const prev = existsSync(new URL('snapshot.json', outDir)) ? read('public/data/snapshot.json') : null;
const prevById = Object.fromEntries((prev?.mountains || []).map(m => [m.id, m]));
const STALE_MS = 24 * 36e5;

// ---------- weather (Open-Meteo, batched) ----------
const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
const r1 = n => Math.round(n * 10) / 10;
const midM = m => Math.round(((m.baseFt + m.summitFt) / 2) * 0.3048);
async function weatherBatch(mountains) {
  const qs = new URLSearchParams({
    latitude: mountains.map(m => m.lat).join(','), longitude: mountains.map(m => m.lon).join(','),
    elevation: mountains.map(midM).join(','),
    daily: 'snowfall_sum,precipitation_sum,temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,wind_gusts_10m_max',
    current: 'temperature_2m,weather_code,wind_speed_10m',
    past_days: '3', forecast_days: '7', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
    wind_speed_unit: 'mph', timezone: 'auto',
  });
  let arr, lastErr;
  const url = 'https://api.open-meteo.com/v1/forecast?' + qs;
  for (let attempt = 0; attempt < 3 && !arr; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
      arr = [].concat(await r.json());
    } catch (e) {
      lastErr = new Error(`${e.message} ${e.cause?.code ?? e.cause?.message ?? ''}`.trim());
      try { // second route: curl with a longer connect timeout (hosted runners sometimes time out connecting)
        const out = execFileSync('curl', ['-fsS', '--connect-timeout', '40', '--max-time', '90', url], { encoding: 'utf8', maxBuffer: 64e6 });
        arr = [].concat(JSON.parse(out));
      } catch { await new Promise(z => setTimeout(z, 10000 * (attempt + 1))); }
    }
  }
  if (!arr) throw lastErr;
  const out = {};
  arr.forEach((w, i) => {
    const d = w.daily, today = w.current?.time?.slice(0, 10) ?? d.time[3];
    const days = d.time.map((date, k) => ({ date, snowIn: r1(d.snowfall_sum[k] ?? 0), precipIn: r1(d.precipitation_sum[k] ?? 0),
      hiF: Math.round(d.temperature_2m_max[k]), loF: Math.round(d.temperature_2m_min[k]),
      code: d.weather_code[k], summary: WMO[d.weather_code[k]] ?? '—',
      windMph: Math.round(d.wind_speed_10m_max[k]), gustMph: Math.round(d.wind_gusts_10m_max[k]) }));
    const ti = days.findIndex(x => x.date === today);
    const sum = xs => r1(xs.reduce((a, x) => a + x.snowIn, 0));
    out[mountains[i].id] = {
      elevationFt: Math.round(midM(mountains[i]) / 0.3048), today, tz: w.timezone ?? null, updated: now.toISOString(),
      now: w.current ? { tempF: Math.round(w.current.temperature_2m), summary: WMO[w.current.weather_code] ?? '—', windMph: Math.round(w.current.wind_speed_10m) } : null,
      past72In: sum(days.slice(Math.max(0, ti - 3), ti)), // modelled snowfall, previous 3 days
      next24In: sum(days.slice(ti, ti + 1)), next72In: sum(days.slice(ti, ti + 3)), next7dIn: sum(days.slice(ti, ti + 7)),
      days,
    };
  });
  return out;
}
async function weather(all) {
  const out = {};
  for (let i = 0; i < all.length; i += 50) {
    try { Object.assign(out, await weatherBatch(all.slice(i, i + 50))); }
    catch (e) { console.error(`weather batch ${i / 50 + 1} failed:`, e.message); }
    if (i + 50 < all.length) await new Promise(z => setTimeout(z, 400));
  }
  return out;
}

// ---------- OnTheSnow regional reports (fills in mountains we cannot read directly) ----------
async function onTheSnow(list) {
  const bySlug = {}, failed = new Set();
  const slugs = [...new Set(list.map(m => m.otsRegion).filter(Boolean))];
  for (const slug of slugs) {
    const cache = new URL(`.cache/ots/${slug}.html`, root);
    const res = process.env.SKI_CACHE && existsSync(cache)
      ? await fetchRegion(async () => ({ ok: true, text: readFileSync(cache, 'utf8') }), slug)
      : await fetchRegion(httpGet, slug);
    if (!res.ok) { failed.add(slug); console.error(`onthesnow ${slug}: ${res.reason}`); }
    for (const r of res.resorts) bySlug[`${slug}/${r.slug}`] = r;
    if (!process.env.SKI_CACHE) await new Promise(z => setTimeout(z, 600));
  }
  return { bySlug, failed };
}
const todayISO = now.toISOString().slice(0, 10);
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
/** Shape an OnTheSnow row like the rest of a report. "Open" only when they flag the resort as open. */
function fromOts(o) {
  const status = o.openFlag === 1 ? 'open' : 'closed';
  const depth = Math.max(o.baseDepthIn ?? 0, o.summitDepthIn ?? 0);
  const hasSnow = status === 'open' || depth > 0 || (o.last72In ?? 0) > 0;
  return {
    status,
    lifts: o.liftsTotal ? { open: o.liftsOpen ?? 0, total: o.liftsTotal, pct: pct(o.liftsOpen ?? 0, o.liftsTotal), list: [] } : null,
    runs: o.runsTotal ? { open: o.runsOpen, total: o.runsTotal, pct: o.runsPct ?? (o.runsOpen == null ? null : pct(o.runsOpen, o.runsTotal)) } : null,
    openingDate: status !== 'open' && o.openingDate && o.openingDate >= todayISO ? o.openingDate : null,
    closingDate: o.closingDate ?? null,
    snow: hasSnow ? { last24In: o.last24In, last48In: o.last48In, last72In: o.last72In, last7dIn: null, baseDepthIn: o.baseDepthIn, summitDepthIn: o.summitDepthIn, seasonIn: null, updated: o.updatedAt } : null,
    updated: o.updatedAt ? new Date(o.updatedAt).toISOString() : null,
    url: resortUrl(o.region, o.slug),
  };
}

// ---------- match a resort's lift names to OpenStreetMap lift lines ----------
const STOP = new Set(['express', 'quad', 'triple', 'double', 'chair', 'chairlift', 'lift', 'high', 'speed', 'six', 'the', 'hsq', 'detachable', 'bubble', 'pack', 'person']);
const tokens = n => String(n || '').toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const core = n => { const t = tokens(n); const c = t.filter(x => !STOP.has(x)); return c.length ? c : t; };
function matchGeo(list, feats) {
  const used = new Set();
  for (const l of list) {
    const a = core(l.name); let best = null, bs = 0;
    for (const f of feats) {
      if (!f.properties.name || used.has(f.properties.osmId)) continue;
      const b = core(f.properties.name);
      const inter = a.filter(x => b.includes(x)).length;
      const score = inter / Math.max(a.length, b.length) + (a.join(' ') === b.join(' ') ? 1 : 0);
      if (inter && score > bs) { bs = score; best = f; }
    }
    if (best && bs >= 0.5) { l.osmId = best.properties.osmId; used.add(l.osmId); }
  }
}

// Ski-map lines for a mountain: OpenSkiMap terrain (lifts + runs) when we have it, else the older lifts-only file.
function terrain(id) {
  const t = new URL(`data/terrain/${id}.json`, root), old = new URL(`data/lifts/${id}.geojson`, root);
  if (existsSync(t)) return JSON.parse(readFileSync(t));
  if (!existsSync(old)) return null;
  const g = JSON.parse(readFileSync(old));
  if (!g.features.length) return null;
  return { attribution: g.attribution, runs: [], lifts: g.features.map(f => ({ id: f.properties.osmId, n: f.properties.name, k: f.properties.kind, c: f.geometry.coordinates, e: [0, 0] })) };
}
const liftFeatures = t => (t?.lifts ?? []).map(l => ({ properties: { name: l.n, osmId: l.id } }));

// ---------- per-mountain report ----------
async function report(m, ots) {
  const src = SOURCES[m.id];
  const o = m.otsSlug && ots.bySlug[`${m.otsRegion}/${m.otsSlug}`] ? fromOts(ots.bySlug[`${m.otsRegion}/${m.otsSlug}`]) : null;
  const otsUrl = m.otsSlug ? resortUrl(m.otsRegion, m.otsSlug) : null;
  const base = { reportUrl: src?.url ?? m.url ?? otsUrl, otsUrl, coverage: 'link', source: null, lifts: null, runs: o?.runs ?? null, closingDate: o?.closingDate ?? null,
    season: { status: 'unknown', openingDate: null, note: null }, news: [], liftsUpdated: null, stale: false, sourceNote: null, resortSnow: null };
  // No direct reading (or it failed): use OnTheSnow's report, else the last one we had, else a link.
  const fallback = error => {
    const old = prevById[m.id];
    if (o) return { ...base, coverage: 'report', source: 'onthesnow', lifts: o.lifts, resortSnow: o.snow, liftsUpdated: o.updated ?? now.toISOString(),
      season: { status: o.status, openingDate: o.openingDate, note: null }, error };
    if (old?.liftsUpdated && now - new Date(old.liftsUpdated) < STALE_MS && old.coverage !== 'link')
      return { ...base, coverage: old.coverage, source: old.source ?? null, lifts: old.lifts, runs: old.runs ?? null, season: old.season, news: old.news, resortSnow: old.resortSnow ?? null, liftsUpdated: old.liftsUpdated, stale: true, error };
    return { ...base, error, sourceNote: error ? 'The resort’s report could not be read right now. Check the official site.'
      : src?.blocked ? 'This resort’s site does not allow automated readers, so live lift status is only on the official site.'
      : 'Live lift status for this mountain is on the official site.' };
  };
  if (!src?.parser) return fallback();
  const get = async (url, opts) => {
    const cache = new URL(`.cache/pages/${m.id}.html`, root);
    if (process.env.SKI_CACHE && url === src.url && existsSync(cache)) return { ok: true, status: 200, text: readFileSync(cache, 'utf8'), blocked: false, reason: '' };
    return httpGet(url, opts);
  };
  try {
    const parse = (await import(`./sources/${src.parser}.mjs`)).default;
    const res = await parse({ id: m.id, url: src.feed ?? src.url, pageUrl: src.url, get, opts: src.opts ?? {} });
    const list = (res.lifts || []).filter(l => l.name);
    matchGeo(list, liftFeatures(terrain(m.id)));
    const open = list.filter(l => l.status === 'open').length;
    // "Open" only when the resort itself reports at least one lift running.
    const status = open > 0 ? 'open' : (list.length || res.closedForSeason ? 'closed' : 'unknown');
    if (status === 'unknown') return fallback();
    const snow = res.resortSnow || o?.snow ? { ...(o?.snow ?? {}), ...Object.fromEntries(Object.entries(res.resortSnow ?? {}).filter(([, v]) => v != null)) } : null;
    return { ...base, coverage: 'live', source: 'resort',
      lifts: list.length ? { open, total: list.length, pct: Math.round(100 * open / list.length), list } : null,
      season: { status, openingDate: status === 'open' ? null : (res.openingDate ?? o?.openingDate ?? null), note: status === 'open' ? null : (res.seasonNote ?? null) },
      news: (res.news || []).slice(0, 4), resortSnow: snow, liftsUpdated: now.toISOString(), reportUpdated: res.reportUpdated ?? null };
  } catch (e) {
    return fallback(String(e.message || e));
  }
}

const list = mountains.filter(m => !only.length || only.includes(m.id));
const [wx, ots] = await Promise.all([weather(list), onTheSnow(list)]);
const results = [];
for (let i = 0; i < list.length; i += 6) results.push(...await Promise.all(list.slice(i, i + 6).map(async m => {
  const rep = await report(m, ots);
  const tf = terrain(m.id);
  if (tf) writeFileSync(new URL(`terrain/${m.id}.json`, outDir), JSON.stringify(tf));
  return { ...m, ...rep, terrain: !!tf, weather: wx[m.id] ?? prevById[m.id]?.weather ?? null };
})));
const merged = only.length && prev ? [...prev.mountains.map(p => results.find(r => r.id === p.id) ?? p), ...results.filter(r => !prevById[r.id])] : results;
if (!process.env.SKI_DRY) writeFileSync(new URL('snapshot.json', outDir), JSON.stringify({ generatedAt: now.toISOString(), mountains: merged }));
if (process.env.SKI_DRY) for (const r of results) console.log(JSON.stringify({ id: r.id, coverage: r.coverage, source: r.source, season: r.season, lifts: r.lifts, runs: r.runs, resortSnow: r.resortSnow, news: r.news, error: r.error }, null, 1));
for (const r of results) console.log(`${r.id.padEnd(22)} ${r.coverage.padEnd(5)} ${r.season.status.padEnd(8)} ${r.lifts ? `${r.lifts.open}/${r.lifts.total} matched ${r.lifts.list.filter(l => l.osmId).length}` : '-'} ${r.error ? 'ERR ' + r.error : ''} ${r.season.note ? '| ' + r.season.note.slice(0, 90) : ''}`);
console.log(`resort feed: ${merged.filter(m => m.coverage === 'live').length}, onthesnow: ${merged.filter(m => m.coverage === 'report').length}, link only: ${merged.filter(m => m.coverage === 'link').length} of ${merged.length} | open: ${merged.filter(m => m.season.status === 'open').length} | weather: ${merged.filter(m => m.weather).length}`);
