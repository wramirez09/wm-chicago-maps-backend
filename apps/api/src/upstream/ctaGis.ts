import { CHICAGO_BBOX } from '@wm/shared';
import type { Env } from '../env.js';
import type { Coord } from '../jobs/ingest/geometry.js';
import { CHICAGO_PORTAL, DATASETS, socrataPages } from './socrata.js';

/**
 * CTA's published GIS extracts on the Chicago data portal. These carry the
 * identifiers the realtime trackers expect — the rail `mapid` and the bus
 * `stpid` — which OSM does not reliably tag, so the overlays are joined
 * against these rather than guessed from OSM.
 */

// Socrata's within_box takes the NW corner then the SE corner, as lat,lon pairs.
const WITHIN_BOX = `within_box(the_geom,${CHICAGO_BBOX[3]},${CHICAGO_BBOX[0]},${CHICAGO_BBOX[1]},${CHICAGO_BBOX[2]})`;

export type RailStop = { mapId: string; name: string; point: Coord };
export type BusStop = { stopId: string | null; name: string; routes: string; point: Coord };
export type BusRoute = { route: string; name: string; parts: Coord[][] };

type RailStopRow = {
  map_id?: string;
  station_name?: string;
  location?: { latitude?: string; longitude?: string };
};
type BusStopRow = {
  the_geom?: { type?: string; coordinates?: unknown };
  systemstop?: string;
  public_nam?: string;
  street?: string;
  cross_st?: string;
  routesstpg?: string;
};
type BusRouteRow = { the_geom?: { type?: string; coordinates?: unknown }; route?: string; name?: string };

const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** `[lng, lat]` pairs, rejecting anything that is not a finite coordinate pair. */
function coord(raw: unknown): Coord | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lng = num(raw[0]), lat = num(raw[1]);
  if (lng === null || lat === null) return null;
  return [lng, lat];
}

function lineParts(geom: BusStopRow['the_geom']): Coord[][] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];
  const raw = geom.coordinates as unknown[];
  // Socrata serves either LineString ([[lng,lat],…]) or MultiLineString ([[[lng,lat],…],…]).
  const groups = geom.type === 'LineString' ? [raw] : raw;
  const out: Coord[][] = [];
  for (const g of groups) {
    if (!Array.isArray(g)) continue;
    const part = g.map(coord).filter((c): c is Coord => c !== null);
    if (part.length >= 2) out.push(part);
  }
  return out;
}

/**
 * One row per stop *and direction*, so the same station appears two or more
 * times; collapse to one entry per `map_id`, which is the id Train Tracker
 * takes as `mapid`.
 */
export function parseRailStops(rows: RailStopRow[]): RailStop[] {
  const byMapId = new Map<string, RailStop>();
  for (const row of rows) {
    const mapId = row.map_id?.trim();
    const name = row.station_name?.trim();
    const lat = num(row.location?.latitude), lng = num(row.location?.longitude);
    if (!mapId || !name || lat === null || lng === null) continue;
    if (!byMapId.has(mapId)) byMapId.set(mapId, { mapId, name, point: [lng, lat] });
  }
  return [...byMapId.values()];
}

/** `systemstop` is published as a float string ("15189.0"); Bus Tracker wants "15189". */
export function parseBusStops(rows: BusStopRow[]): BusStop[] {
  const out: BusStop[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.the_geom?.type !== 'Point') continue;
    const point = coord(row.the_geom.coordinates);
    if (!point) continue;
    const raw = num(row.systemstop);
    const stopId = raw !== null && Number.isInteger(raw) && raw > 0 ? String(raw) : null;
    const name = row.public_nam?.trim() || [row.street?.trim(), row.cross_st?.trim()].filter(Boolean).join(' & ');
    if (!name) continue;
    const key = stopId ?? `${name}@${point[0]},${point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const routes = (row.routesstpg ?? '').split(',').map((r) => r.trim()).filter(Boolean).join(', ');
    out.push({ stopId, name, routes, point });
  }
  return out;
}

export function parseBusRoutes(rows: BusRouteRow[]): BusRoute[] {
  const out: BusRoute[] = [];
  for (const row of rows) {
    const route = row.route?.trim();
    if (!route) continue;
    const parts = lineParts(row.the_geom);
    if (!parts.length) continue;
    out.push({ route, name: row.name?.trim() ?? '', parts });
  }
  return out;
}

async function allRows<T>(env: Env, dataset: string, where?: string): Promise<T[]> {
  const rows: T[] = [];
  for await (const page of socrataPages<T>(env, CHICAGO_PORTAL, dataset, where ? { where } : {})) rows.push(...page);
  return rows;
}

export async function fetchRailStops(env: Env): Promise<RailStop[]> {
  return parseRailStops(await allRows<RailStopRow>(env, DATASETS.ctaRailStops));
}

export async function fetchBusStops(env: Env): Promise<BusStop[]> {
  return parseBusStops(await allRows<BusStopRow>(env, DATASETS.ctaBusStops, WITHIN_BOX));
}

export async function fetchBusRoutes(env: Env): Promise<BusRoute[]> {
  return parseBusRoutes(await allRows<BusRouteRow>(env, DATASETS.ctaBusRoutes));
}
