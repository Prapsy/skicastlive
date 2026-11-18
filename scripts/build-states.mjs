// One-time: extract the six New England states from us-atlas into src/states.json (GeoJSON).
import { readFileSync, writeFileSync } from 'node:fs';
import { feature, mesh } from 'topojson-client';
const topo = JSON.parse(readFileSync(new URL('../node_modules/us-atlas/states-10m.json', import.meta.url)));
const NE = { '09': 'CT', '23': 'ME', '25': 'MA', '33': 'NH', '44': 'RI', '50': 'VT' };
const round = c => typeof c[0] === 'number' ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round);
const states = feature(topo, topo.objects.states).features.filter(f => NE[f.id])
  .map(f => ({ type: 'Feature', properties: { code: NE[f.id], name: f.properties.name }, geometry: { ...f.geometry, coordinates: round(f.geometry.coordinates) } }));
writeFileSync(new URL('../src/states.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features: states }));
console.log(states.map(s => s.properties.code).join(' '));
