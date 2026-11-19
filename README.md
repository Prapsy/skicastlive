# SkiCastLive

A live globe of North America's ski mountains (US and Canada): pick where you plan on skiing, see what is
open right now, lifts and runs open, snow depth, recent and forecast snowfall, a drawn ski map for each
mountain, and links straight to the resort.

## How it works

- **Site** (`src/`): a static page built with Vite, TypeScript and D3. No server.
  - `globe.ts` draws the globe (canvas) and the mountain markers; open mountains glow, closed ones are dimmed.
  - `picker.ts` is the "Where do you plan on skiing?" rail: regions, then Open / Closed tables.
  - `panel.ts` is the mountain panel: Report, Weather, Ski map, News.
- **Data job** (`scripts/update.mjs`): writes `public/data/snapshot.json`. Status comes from two places:
  1. **The resort's own report**, read by a small adapter in `scripts/sources/` (lift-by-lift detail).
  2. **[OnTheSnow](https://www.onthesnow.com/skireport)** regional report pages (`scripts/sources/onthesnow.mjs`),
     one request per state or province, for every mountain without a working adapter. Credited and linked in the panel.
  - A mountain is shown as **Open** only when one of those sources reports it open. Nothing is guessed.
  - Weather and snowfall come from [Open-Meteo](https://open-meteo.com/) at mid-mountain elevation.
- **Mountain list** (`data/mountains.json`, `data/regions.json`): built by `npm run seed` from OnTheSnow's resort
  list, with coordinates and elevations from OpenSkiMap. Name mismatches are fixed in `data/seed-aliases.json`.
- **Ski maps** (`data/terrain/`): lifts and runs by difficulty from OpenSkiMap / OpenStreetMap
  (© OpenStreetMap contributors, ODbL). Rebuild with `npm run terrain` (downloads about 1 GB into `.cache`).
- **Globe shapes** (`src/geo.json`): Natural Earth, rebuilt with `npm run geo`.
- **Publishing** (`.github/workflows/update.yml`): GitHub Actions re-runs the data job and redeploys to
  GitHub Pages every 30 minutes.

## Commands

```bash
npm install
npm run update   # fetch weather + reports into public/data (about a minute)
npm run dev      # local preview
npm run build    # production build in dist/
```

## Adding or fixing a mountain

1. `npm run seed` picks up new resorts from OnTheSnow. If one is reported as unmatched, add its OpenSkiMap name
   (or coordinates) to `data/seed-aliases.json` and run it again.
2. `npm run terrain` to draw its ski map.
3. Optional: point it at a resort adapter in `scripts/sources/config*.mjs` for lift-by-lift status. Test with
   `SKI_DRY=1 node scripts/update.mjs <id>`.

Conditions change quickly and report sites change their layout; always confirm with the mountain.
