// One-time: build src/geo.json for the globe. World land from world-atlas (Natural Earth 110m), plus
// US state and Canadian province shapes from Natural Earth's 50m admin-1 file (public domain).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { feature } from 'topojson-client';
const root = new URL('../', import.meta.url);
const src = new URL('.cache/admin1.geojson', root);
if (!existsSync(src)) execFileSync('curl', ['-fsS', '--create-dirs', '-o', src.pathname, 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson']);
const ring = r => { const out = []; for (const [x, y] of r) { const p = [+x.toFixed(2), +y.toFixed(2)]; const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); } return out; };
const geom = g => g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.coordinates.map(ring).filter(r => r.length > 3) }
  : { type: 'MultiPolygon', coordinates: g.coordinates.map(p => p.map(ring).filter(r => r.length > 3)).filter(p => p.length) };
const topo = JSON.parse(readFileSync(new URL('node_modules/world-atlas/land-110m.json', root)));
const land = geom(feature(topo, topo.objects.land).features[0].geometry);
const states = JSON.parse(readFileSync(src)).features.filter(f => ['US', 'CA'].includes(f.properties.iso_a2))
  .map(f => ({ type: 'Feature', properties: { code: f.properties.postal, name: f.properties.name, country: f.properties.iso_a2 }, geometry: geom(f.geometry) }));
writeFileSync(new URL('src/geo.json', root), JSON.stringify({ land, states: { type: 'FeatureCollection', features: states } }));
console.log(states.length, 'states / provinces');
