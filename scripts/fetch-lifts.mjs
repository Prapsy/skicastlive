// Fetch lift lines (OSM aerialway ways) near every mountain in ONE Overpass request,
// save per-mountain GeoJSON, and report how far each seed coordinate is from its lifts.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const mountains = JSON.parse(readFileSync(new URL('data/mountains.json', root)));
const UA = 'skicastlive-build/0.1 (ski conditions site)';
const SKIP = new Set(['goods', 'zip_line', 'station', 'pylon', 'construction', 'proposed', 'abandoned', 'disused']);
const D = 0.04;
// Resorts that sit close together or span several peaks need explicit anchor points.
const ANCHORS = {
  'killington': [[43.62, -72.80], [43.605, -72.82], [43.635, -72.82], [43.60, -72.77]],
  'pico': [[43.662, -72.843]],
  'sugarbush': [[44.1357, -72.8944], [44.177, -72.93]],
  'mad-river-glen': [[44.2025, -72.9175]],
};
const km = (aLat, aLon, bLat, bLon) => Math.hypot((aLon - bLon) * 111 * Math.cos(aLat * Math.PI / 180), (aLat - bLat) * 111);
const box = (lat, lon) => { const dl = D / Math.cos(lat * Math.PI / 180); return [lat - D, lon - dl, lat + D, lon + dl]; };
async function query(points) {
  const q = `[out:json][timeout:120];(${points.map(([la, lo]) => `way["aerialway"](${box(la, lo).map(n => n.toFixed(4)).join(',')});`).join('')});out tags geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST',
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q) });
  if (!r.ok) { console.error('Overpass HTTP', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  return (await r.json()).elements.filter(e => e.geometry && !SKIP.has(e.tags.aerialway));
}
const mid = el => { const g = el.geometry; return [g.reduce((a, p) => a + p.lat, 0) / g.length, g.reduce((a, p) => a + p.lon, 0) / g.length]; };
const centroid = els => { const pts = els.flatMap(e => e.geometry); return [pts.reduce((a, p) => a + p.lat, 0) / pts.length, pts.reduce((a, p) => a + p.lon, 0) / pts.length]; };

// Pass 1: rough centres from the seed coordinates. Pass 2: re-query around the refined centres.
let els = await query(mountains.map(m => [m.lat, m.lon]));
const anchors = {};
for (const m of mountains) {
  if (ANCHORS[m.id]) { anchors[m.id] = ANCHORS[m.id]; continue; }
  const near = els.filter(e => { const [la, lo] = mid(e); return km(la, lo, m.lat, m.lon) < 5; });
  anchors[m.id] = [near.length ? centroid(near) : [m.lat, m.lon]];
}
await new Promise(r => setTimeout(r, 5000));
els = await query(Object.values(anchors).flat());
console.log(els.length, 'lift ways total');
const assigned = Object.fromEntries(mountains.map(m => [m.id, []]));
for (const el of els) {
  const [la, lo] = mid(el); let best = null, bd = 4.5;
  for (const m of mountains) for (const [ala, alo] of anchors[m.id]) { const d = km(la, lo, ala, alo); if (d < bd) { bd = d; best = m.id; } }
  if (best) assigned[best].push(el);
}
for (const m of mountains) {
  const feats = assigned[m.id].map(el => ({
    type: 'Feature',
    properties: { osmId: el.id, name: el.tags.name || null, kind: el.tags.aerialway,
      occupancy: el.tags['aerialway:occupancy'] ? +el.tags['aerialway:occupancy'] : null },
    geometry: { type: 'LineString', coordinates: el.geometry.map(p => [+p.lon.toFixed(5), +p.lat.toFixed(5)]) },
  }));
  writeFileSync(new URL(`data/lifts/${m.id}.geojson`, root), JSON.stringify({ type: 'FeatureCollection',
    attribution: '© OpenStreetMap contributors (ODbL)', features: feats }));
  if (feats.length) { const [cy, cx] = centroid(assigned[m.id]); m.lat = +cy.toFixed(4); m.lon = +cx.toFixed(4); }
  console.log(`${m.id}: ${feats.length} | ` + feats.map(f => f.properties.name || '?').join('; '));
}
writeFileSync(new URL('data/mountains.json', root), JSON.stringify(mountains, null, 1));
