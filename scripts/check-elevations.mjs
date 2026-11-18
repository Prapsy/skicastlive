// Dev check: compare listed base/summit elevations with terrain elevation at the lift endpoints (Open-Meteo elevation API).
import { readFileSync } from 'node:fs';
const ms = JSON.parse(readFileSync('data/mountains.json'));
const from = process.argv[2]; let go = !from;
for (const m of ms) {
  if (m.id === from) go = true;
  if (!go) continue;
  const pts = JSON.parse(readFileSync(`data/lifts/${m.id}.geojson`)).features.flatMap(f => [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)]).slice(0, 100);
  if (!pts.length) continue;
  let r; for (let i = 0; i < 6; i++) { r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[1]).join(',')}&longitude=${pts.map(p => p[0]).join(',')}`); if (r.status !== 429) break; await new Promise(z => setTimeout(z, 30000)); }
  if (!r.ok) { console.log(m.id, 'HTTP', r.status); continue; }
  const ft = (await r.json()).elevation.map(e => e * 3.28084);
  const lo = Math.round(Math.min(...ft)), hi = Math.round(Math.max(...ft));
  const flag = Math.abs(lo - m.baseFt) > 250 || Math.abs(hi - m.summitFt) > 300 ? '  <-- CHECK' : '';
  console.log(`${m.id.padEnd(22)} listed ${m.baseFt}-${m.summitFt}  lifts ${lo}-${hi}${flag}`);
  await new Promise(r => setTimeout(r, 2500));
}
