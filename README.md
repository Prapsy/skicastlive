# SkiCastLive

An interactive map of New England's lift-served ski mountains: what is open, which lifts are
running, recent and forecast snowfall, and the next few days of weather.

## How it works

- **Site** (`src/`): a static page built with Vite, TypeScript and D3. No server.
- **Data job** (`scripts/update.mjs`): writes `public/data/snapshot.json`.
  - Weather and snowfall for every mountain come from [Open-Meteo](https://open-meteo.com/) at mid-mountain elevation.
  - Lift status comes from each resort's own public report, read by a small adapter in `scripts/sources/`.
    A mountain is shown as **Open** only when its own report lists at least one lift running.
  - Sites that refuse automated readers are not read; those mountains link to the official report instead.
- **Lift lines** (`data/lifts/`): from OpenStreetMap (© OpenStreetMap contributors, ODbL). Refresh with `npm run lifts`.
- **Publishing** (`.github/workflows/update.yml`): GitHub Actions re-runs the data job and redeploys to
  GitHub Pages every 30 minutes.

## Commands

```bash
npm install
npm run update   # fetch weather + resort reports into public/data
npm run dev      # local preview
npm run build    # production build in dist/
```

## Adding or fixing a mountain

1. Add it to `data/mountains.json` (id, name, state, lat, lon, base and summit elevation in feet, website).
2. Run `npm run lifts` to pull its lift lines.
3. Point it at an adapter in `scripts/sources/config*.mjs`. Test with
   `SKI_DRY=1 node scripts/update.mjs <id>`.

Conditions change quickly and resort sites change their layout; always confirm with the mountain.
