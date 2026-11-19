// Run by hand: grow data/mountains.json to every US / Canada resort OnTheSnow reports on.
// Names + report slugs come from OnTheSnow's regional pages; coordinates, elevations and websites from
// OpenSkiMap's ski-area list (© OpenStreetMap contributors, ODbL). Existing records keep their id and position.
// Usage: node scripts/seed-resorts.mjs [--refresh]   (pages are cached in .cache/ots)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get } from './lib/http.mjs';
import { parseRegion, regionUrl } from './sources/onthesnow.mjs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root)));
const { regions } = read('data/regions.json');
const mountains = read('data/mountains.json');
const refresh = process.argv.includes('--refresh');
mkdirSync(new URL('.cache/ots/', root), { recursive: true });

// Hand fixes where the two sources use different names. otsSlug -> OpenSkiMap name (same state / province).
const ALIAS = read('data/seed-aliases.json');

const areasFile = new URL('.cache/ski_areas.geojson', root);
if (!existsSync(areasFile) || refresh)
  execFileSync('curl', ['-fsS', '--compressed', '--retry', '4', '--retry-delay', '8', '--retry-all-errors', '--max-time', '240', '-o', areasFile.pathname, 'https://tiles.openskimap.org/geojson/ski_areas.geojson']);
const areas = JSON.parse(readFileSync(areasFile, 'utf8')).features
  .filter(f => f.properties.name && (f.properties.activities || []).includes('downhill') && f.properties.status !== 'abandoned');

const STOP = new Set(['resort', 'resorts', 'ski', 'skiing', 'area', 'areas', 'the', 'at', 'and', 'snow', 'park', 'winter', 'sports', 'center', 'centre', 'station', 'de', 'du', 'le', 'la', 'les', 'of', 'mountain', 'mountains', 'mount', 'mont', 'hill', 'hills', 'valley', 'basin', 'bowl', 'lodge', 'club', 'recreation', 'village', 'alpine', 'snowsports', 'snowboard']);
const words = n => String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/\bmt\b\.?/g, 'mount').replace(/\bmtn\b\.?/g, 'mountain')
  .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const core = n => { const w = words(n); const c = w.filter(x => !STOP.has(x)); return c.length ? c : w; };
function score(a, b) {
  const A = core(a), B = core(b);
  if (A.join(' ') === B.join(' ')) return words(a).join(' ') === words(b).join(' ') ? 3 : 2;
  const inter = A.filter(x => B.includes(x)).length;
  if (!inter) return 0;
  const contained = inter === Math.min(A.length, B.length);
  return inter / Math.max(A.length, B.length) + (contained ? 0.5 : 0);
}
function centre(g) {
  if (g.type === 'Point') return g.coordinates;
  const pts = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap(p => p[0]);
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
const ft = m => Math.round(m / 0.3048);
function elev(p) {
  const r = p.statistics?.runs, l = p.statistics?.lifts;
  const lo = [r?.minElevation, l?.minElevation].filter(Number.isFinite), hi = [r?.maxElevation, l?.maxElevation].filter(Number.isFinite);
  return lo.length && hi.length ? { baseFt: ft(Math.min(...lo)), summitFt: ft(Math.max(...hi)) } : null;
}
const liftCount = p => Object.values(p.statistics?.lifts?.byType || {}).reduce((a, t) => a + (t.count || 0), 0);

const byId = new Map(mountains.map(m => [m.id, m]));
const unmatched = [];
let added = 0, linked = 0;
for (const reg of regions) {
  for (const m of mountains) if (m.state === reg.code) { m.country = reg.country; m.group = reg.group; }
  if (!reg.ots) continue;
  const cache = new URL(`.cache/ots/${reg.ots}.html`, root);
  let html = existsSync(cache) && !refresh ? readFileSync(cache, 'utf8') : null;
  if (!html) {
    const res = await get(regionUrl(reg.ots));
    if (!res.ok) { console.error(`${reg.ots}: ${res.reason}`); continue; }
    html = res.text; writeFileSync(cache, html);
    await new Promise(r => setTimeout(r, 1500));
  }
  const resorts = parseRegion(html);
  const iso = `${reg.country}-${reg.code}`;
  const local = areas.filter(f => (f.properties.places || []).some(pl => pl.iso3166_2 === iso));
  const mine = mountains.filter(m => m.state === reg.code);
  const taken = new Set(mine.map(m => m.otsSlug).filter(Boolean));
  for (const r of resorts) {
    if (taken.has(r.slug)) { linked++; continue; }
    // 1. an existing record for the same mountain keeps its id, adapter and lift lines
    let best = null, bs = 0;
    for (const m of mine) { if (m.otsSlug) continue; const s = Math.max(score(r.name, m.name), score(r.shortName, m.name)); if (s > bs) { bs = s; best = m; } }
    if (ALIAS[r.slug]?.id) { best = byId.get(ALIAS[r.slug].id); bs = 9; }
    if (best && bs >= 1.5) { best.otsSlug = r.slug; best.otsRegion = reg.ots; taken.add(r.slug); linked++; continue; }
    // 2. new record: position from OpenSkiMap
    let area = null, as = 0;
    const want = ALIAS[r.slug];
    if (want && typeof want === 'object') area = { geometry: { type: 'Point', coordinates: [want.lon, want.lat] }, properties: { websites: [want.url], fixed: want } }, as = 9;
    else for (const f of local) {
      const s = want ? (f.properties.name === want ? 9 : 0) : Math.max(score(r.name, f.properties.name), score(r.shortName, f.properties.name)) + Math.min(0.2, liftCount(f.properties) / 100);
      if (s > as) { as = s; area = f; }
    }
    if (!area || as < 1.2) { unmatched.push(`${reg.code} ${r.slug} "${r.name}"${area ? ` (closest: ${area.properties.name} ${as.toFixed(2)})` : ''}`); continue; }
    if (process.env.SEED_DEBUG && as < 2) console.log(`  ~ ${reg.code} "${r.name}" -> "${area.properties.name}" ${as.toFixed(2)}`);
    const [lon, lat] = centre(area.geometry), e = area.properties.fixed ?? elev(area.properties);
    let id = r.slug.replace(/-(ski-)?(resort|area|ski-area|mountain-resort)$/, '');
    if (byId.has(id)) id = `${id}-${reg.code.toLowerCase()}`;
    if (byId.has(id)) { unmatched.push(`${reg.code} ${r.slug} id clash`); continue; }
    const rec = { id, name: r.shortName, state: reg.code, country: reg.country, group: reg.group,
      lat: +lat.toFixed(4), lon: +lon.toFixed(4), baseFt: e?.baseFt ?? null, summitFt: e?.summitFt ?? null,
      url: (area.properties.websites || [])[0] ?? null, otsSlug: r.slug, otsRegion: reg.ots };
    mountains.push(rec); byId.set(id, rec); taken.add(r.slug); added++;
  }
}
writeFileSync(new URL('data/mountains.json', root), JSON.stringify(mountains, null, 1));
console.log(`total ${mountains.length} | added ${added} | linked to OnTheSnow ${linked} | unmatched ${unmatched.length}`);
for (const u of unmatched) console.log('  ?', u);
