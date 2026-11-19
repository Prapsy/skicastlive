import regionsJson from '../data/regions.json';

export type LiftStatus = 'open' | 'closed' | 'hold' | 'scheduled';
export interface Lift { name: string; status: LiftStatus; osmId?: number }
export interface Day { date: string; snowIn: number; precipIn: number; hiF: number; loF: number; code: number; summary: string; windMph: number; gustMph: number }
export interface Weather { elevationFt: number; today: string; tz?: string | null; updated?: string; now: { tempF: number; summary: string; windMph: number } | null; past72In: number; next24In: number; next72In: number; next7dIn: number; days: Day[] }
export interface News { title: string; date?: string | null; excerpt?: string; url?: string }
export interface ResortSnow { last24In?: number | null; last48In?: number | null; last72In?: number | null; last7dIn?: number | null; baseDepthIn?: number | null; summitDepthIn?: number | null; seasonIn?: number | null; updated?: string | null }
export interface Mountain {
  id: string; name: string; state: string; country: string; group: string; lat: number; lon: number; baseFt: number; summitFt: number; url: string | null;
  trailMapUrl?: string; reportUrl: string | null; otsUrl: string | null; coverage: 'live' | 'report' | 'link'; source: 'resort' | 'onthesnow' | null;
  stale: boolean; sourceNote: string | null; terrain: boolean;
  lifts: { open: number; total: number; pct: number; list: Lift[] } | null;
  runs: { open: number | null; total: number; pct: number | null } | null;
  season: { status: 'open' | 'closed' | 'unknown'; openingDate: string | null; note: string | null };
  closingDate?: string | null;
  resortSnow?: ResortSnow | null;
  news: News[]; liftsUpdated: string | null; reportUpdated?: string | null; weather: Weather | null;
}
export interface Snapshot { generatedAt: string; mountains: Mountain[] }
export interface Terrain {
  attribution?: string;
  lifts: { id: number | null; n: string | null; k: string; c: [number, number][]; e: [number, number] }[];
  runs: { n: string | null; d: string; c: [number, number][]; e: [number, number] }[];
}
export interface Group { id: string; name: string; blurb: string; label: [number, number] }
export interface Region { code: string; name: string; country: string; group: string }

export const GROUPS = regionsJson.groups as unknown as Group[];
export const REGIONS = regionsJson.regions as Region[];
const regionByCode = new Map(REGIONS.map(r => [r.code, r]));
export const regionName = (code: string) => regionByCode.get(code)?.name ?? code;

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;
export const vert = (m: Mountain) => m.summitFt - m.baseFt;
export const statusWord = (m: Mountain) => m.season.status === 'open' ? 'Open' : m.season.status === 'closed' ? 'Closed' : 'Status on official site';

// ---- units (remembered on this device when the browser allows it) ----
let metric = false;
try { metric = localStorage.getItem('units') === 'metric'; } catch { /* storage unavailable */ }
export const isMetric = () => metric;
export function setMetric(v: boolean) { metric = v; try { localStorage.setItem('units', v ? 'metric' : 'imperial'); } catch { /* not remembered */ } }
const trim = (n: number) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''));
/** Snow amount: inches, or centimetres in metric. */
export const snow = (inches: number) => (metric ? `${trim(inches * 2.54)} cm` : `${trim(inches)}″`);
export const temp = (f: number) => (metric ? `${Math.round((f - 32) * 5 / 9)}°` : `${f}°`);
export const tempUnit = () => (metric ? '°C' : '°F');
export const elev = (ft: number) => (metric ? `${Math.round(ft * 0.3048).toLocaleString()} m` : `${ft.toLocaleString()} ft`);
export const wind = (mph: number) => (metric ? `${Math.round(mph * 1.609)} km/h` : `${mph} mph`);

export const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} hr ago`;
  return `${Math.round(min / 1440)} days ago`;
};
export const dayName = (d: string, today: string) => d === today ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
export const longDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const shortDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const wxGlyph = (code: number) => code >= 95 ? '⚡' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? '❄' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? '☂' : code >= 45 ? '≋' : code >= 2 ? '☁' : '☀';

/** Deepest snow the resort reports (base or summit), in inches; null when it reports none. */
export const depthIn = (m: Mountain) => { const d = Math.max(m.resortSnow?.baseDepthIn ?? 0, m.resortSnow?.summitDepthIn ?? 0); return d > 0 ? d : null; };
/** Snow in the last 3 days: the resort's own number when it reports one, else the modelled figure. */
export const recentIn = (m: Mountain) => m.resortSnow?.last72In ?? m.weather?.past72In ?? 0;
