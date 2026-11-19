// Run by hand: build data/terrain/<id>.json (lift lines + ski runs by difficulty) for every mountain from
// OpenSkiMap's published GeoJSON (© OpenStreetMap contributors, ODbL). The downloads are large (about 1 GB
// unpacked) and are kept in .cache; pass --refresh to fetch them again.
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const mountains = JSON.parse(readFileSync(new URL('data/mountains.json', root)));
const refresh = process.argv.includes('--refresh');
mkdirSync(new URL('data/terrain/', root), { recursive: true });
mkdirSync(new URL('.cache/', root), { recursive: true });
const file = name => {
  const u = new URL(`.cache/${name}.geojson`, root);
  if (!existsSync(u) || refresh) execFileSync('curl', ['-fsS', '--compressed', '--retry', '4', '--retry-delay', '8', '--retry-all-errors', '-o', u.pathname, `https://tiles.openskimap.org/geojson/${name}.geojson`], { stdio: 'inherit' });
  return u;
};

// ---- which OpenSkiMap ski area is each mountain? nearest downhill area with lifts, within 3 km ----
const km = (aLat, aLon, bLat, bLon) => Math.hypot((aLon - bLon) * 111 * Math.cos(aLat * Math.PI / 180), (aLat - bLat) * 111);
function centre(g) {
  if (g.type === 'Point') return g.coordinates;
  const pts = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap(p => p[0]);
  let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
const areas = JSON.parse(readFileSync(file('ski_areas'), 'utf8')).features
  .filter(f => (f.properties.activities || []).includes('downhill') && f.properties.status !== 'abandoned' && /^(US|CA)$/.test(f.properties.places?.[0]?.iso3166_1Alpha2 ?? ''))
  .map(f => ({ id: f.properties.id, name: f.properties.name, c: centre(f.geometry) }));
const areaOf = new Map(); // OpenSkiMap area id -> mountain id
const claimed = [];
for (const m of mountains) for (const a of areas) { const d = km(m.lat, m.lon, a.c[1], a.c[0]); if (d < 3) claimed.push({ d, m: m.id, a: a.id }); }
claimed.sort((x, y) => x.d - y.d);
const hasArea = new Set();
for (const c of claimed) { if (areaOf.has(c.a) || hasArea.has(c.m)) continue; areaOf.set(c.a, c.m); hasArea.add(c.m); }

// ---- stream the big files one feature per line ----
const out = Object.fromEntries(mountains.map(m => [m.id, { lifts: [], runs: [] }]));
const r5 = n => Math.round(n * 1e5) / 1e5;
function line(coords, minGapM = 18) {
  const pts = [];
  for (let i = 0; i < coords.length; i++) {
    const [x, y] = coords[i], last = pts[pts.length - 1];
    if (last && i < coords.length - 1 && km(y, x, last[1], last[0]) * 1000 < minGapM) continue;
    pts.push([r5(x), r5(y)]);
  }
  return pts;
}
const ends = coords => [Math.round(coords[0][2] ?? 0), Math.round(coords[coords.length - 1][2] ?? 0)];
async function each(name, fn) {
  const rl = createInterface({ input: createReadStream(file(name)), crlfDelay: Infinity });
  for await (let l of rl) {
    if (l[0] !== '{' || !l.includes('"skiAreas":[{')) continue;
    if (l.endsWith(',')) l = l.slice(0, -1);
    let f; try { f = JSON.parse(l); } catch { continue; }
    const p = f.properties;
    const id = (p.skiAreas || []).map(a => areaOf.get(a.properties?.id)).find(Boolean);
    if (id && f.geometry?.type === 'LineString' && f.geometry.coordinates.length > 1 && p.status === 'operating') fn(out[id], f, p);
  }
}
const SKIP_LIFT = new Set(['goods', 'zip_line', 'station', 'pylon']);
await each('lifts', (t, f, p) => {
  if (SKIP_LIFT.has(p.liftType)) return;
  const way = (p.sources || []).find(s => s.type === 'openstreetmap' && /^way\//.test(String(s.id)));
  t.lifts.push({ id: way ? +String(way.id).slice(4) : null, n: p.name || null, k: p.liftType, c: line(f.geometry.coordinates, 40), e: ends(f.geometry.coordinates) });
});
await each('runs', (t, f, p) => {
  if (!(p.uses || []).includes('downhill')) return;
  t.runs.push({ n: p.name || null, d: p.difficulty || 'other', c: line(f.geometry.coordinates), e: ends(f.geometry.coordinates) });
});

let none = [];
for (const m of mountains) {
  const t = out[m.id];
  if (!t.lifts.length && !t.runs.length) { none.push(m.id); continue; }
  writeFileSync(new URL(`data/terrain/${m.id}.json`, root), JSON.stringify({ attribution: '© OpenStreetMap contributors (ODbL), via OpenSkiMap', ...t }));
}
console.log(`terrain for ${mountains.length - none.length} of ${mountains.length} mountains`);
console.log('none:', none.join(', '));
