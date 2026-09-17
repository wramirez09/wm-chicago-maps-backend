import { eq, geomFromGeoJson, layerFeatures, layerRuns, ne, and } from '@wm/db';
import {
  CHICAGO_BBOX,
  CTA_BUS_COLOR,
  CTA_LINE_COLORS,
  LAYER_ATTRIBUTION,
  METRA_LINE_COLORS,
  type LayerKey,
  type MetraLine,
} from '@wm/shared';
import { randomUUID } from 'node:crypto';
import { invalidate } from '../../lib/cache.js';
import { fetchBusRoutes, fetchBusStops, fetchRailStops, type RailStop } from '../../upstream/ctaGis.js';
import { overpass, type OverpassElement } from '../../upstream/overpass.js';
import type { JobContext, JobHandler } from '../index.js';
import { dedupeConsecutive, metersBetween, metersToSegment, round5, simplify, type Coord } from './geometry.js';
// Overpass bbox order is south,west,north,east.
const BBOX = `${CHICAGO_BBOX[1]},${CHICAGO_BBOX[0]},${CHICAGO_BBOX[3]},${CHICAGO_BBOX[2]}`;

type Feature = { osmKey: string; properties: Record<string, unknown>; line?: Coord[]; point?: Coord };

const ALL_LAYERS: LayerKey[] = [
  'expressways', 'arterials', 'transit-lines', 'transit-stations',
  'bus-routes', 'bus-stops', 'metra-lines', 'metra-stations',
];

/**
 * Ports scripts/fetch-{expressways,arterials,transit}.mjs from the mobile
 * repo, plus the CTA bus and Metra overlays. Each layer is written as a new
 * run and then flipped to `current`, so readers never see a half-written
 * layer. Weekly by default; the data barely changes.
 *
 * Road and rail geometry comes from OSM. The identifiers the realtime
 * trackers need do not, so rail and bus stops are joined against CTA's
 * published GIS extracts and Metra stations read OSM's `ref:metra` tag.
 */
export const ingestLayers: JobHandler<{ only?: LayerKey[] }> = async (ctx, data) => {
  const wanted = new Set<LayerKey>(data.only ?? ALL_LAYERS);
  if (wanted.has('expressways')) await writeLayer(ctx, 'expressways', await fetchExpressways(ctx));
  if (wanted.has('arterials')) await writeLayer(ctx, 'arterials', await fetchArterials(ctx));
  if (wanted.has('transit-lines') || wanted.has('transit-stations')) {
    const { lines, stations } = await fetchTransit(ctx);
    if (wanted.has('transit-lines')) await writeLayer(ctx, 'transit-lines', lines);
    if (wanted.has('transit-stations')) await writeLayer(ctx, 'transit-stations', stations);
  }
  if (wanted.has('bus-routes')) await writeLayer(ctx, 'bus-routes', await fetchBusRouteFeatures(ctx));
  if (wanted.has('bus-stops')) await writeLayer(ctx, 'bus-stops', await fetchBusStopFeatures(ctx));
  if (wanted.has('metra-lines') || wanted.has('metra-stations')) {
    const metra = await fetchMetra(ctx);
    if (wanted.has('metra-lines')) await writeLayer(ctx, 'metra-lines', metra.lines);
    if (wanted.has('metra-stations')) await writeLayer(ctx, 'metra-stations', metra.stations);
  }
};

async function writeLayer({ db, log }: JobContext, layer: LayerKey, features: Feature[]) {
  const runId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(layerRuns).values({ id: runId, layer, featureCount: features.length, attribution: LAYER_ATTRIBUTION[layer], current: false });
    for (let i = 0; i < features.length; i += 500) {
      await tx.insert(layerFeatures).values(
        features.slice(i, i + 500).map((f) => ({
          layer,
          runId,
          osmKey: f.osmKey,
          properties: f.properties,
          line: f.line ? (geomFromGeoJson({ type: 'LineString', coordinates: f.line }) as never) : null,
          point: f.point ? (geomFromGeoJson({ type: 'Point', coordinates: f.point }) as never) : null,
        })),
      );
    }
    await tx.update(layerRuns).set({ current: false }).where(eq(layerRuns.layer, layer));
    await tx.update(layerRuns).set({ current: true }).where(eq(layerRuns.id, runId));
    // Prune previous runs for this layer.
    await tx.delete(layerFeatures).where(and(eq(layerFeatures.layer, layer), ne(layerFeatures.runId, runId)));
    await tx.delete(layerRuns).where(and(eq(layerRuns.layer, layer), ne(layerRuns.id, runId)));
  });
  invalidate('layer:');
  log.info({ layer, features: features.length, runId }, 'layer written');
}

function wayLine(el: OverpassElement, tolerance: number): Coord[] | null {
  if (!el.geometry) return null;
  const raw = dedupeConsecutive(el.geometry.map((p) => [round5(p.lon), round5(p.lat)] as Coord));
  if (raw.length < 2) return null;
  return dedupeConsecutive(simplify(raw, tolerance));
}

// --- expressways: motorway + trunk ways, with Chicago's local names.
const LOCAL_NAMES: [RegExp, string][] = [
  [/Kennedy/i, 'Kennedy'], [/Dan Ryan/i, 'Dan Ryan'], [/Eisenhower/i, 'Eisenhower'], [/Stevenson/i, 'Stevenson'],
  [/Edens/i, 'Edens'], [/Bishop Ford/i, 'Bishop Ford'], [/Chicago Skyway|Skyway/i, 'Skyway'], [/Lake Shore/i, 'Lake Shore Drive'],
  [/Jane Addams|Northwest Tollway/i, 'Jane Addams'], [/Tri-?State/i, 'Tri-State'], [/Kingery/i, 'Kingery'], [/Calumet/i, 'Calumet'],
];
const localNameFor = (name: string) => LOCAL_NAMES.find(([re]) => re.test(name))?.[1] ?? '';

async function fetchExpressways(ctx: JobContext): Promise<Feature[]> {
  const els = await overpass(ctx.env, `[out:json][timeout:180];\nway["highway"~"^(motorway|trunk)$"](${BBOX});\nout geom;`, 'expressways', ctx.log);
  const out: Feature[] = [];
  for (const el of els) {
    const line = wayLine(el, 0.00005);
    const tags = el.tags ?? {};
    if (!line) continue;
    out.push({
      osmKey: `way/${el.id}`,
      properties: { name: tags.name ?? '', ref: tags.ref ?? '', kind: tags.highway === 'motorway' ? 'motorway' : 'trunk', localName: localNameFor(tags.name ?? '') },
      line,
    });
  }
  return out;
}

// --- arterials: named primary + secondary streets.
async function fetchArterials(ctx: JobContext): Promise<Feature[]> {
  const els = await overpass(ctx.env, `[out:json][timeout:180];\nway["highway"~"^(primary|secondary)$"]["name"](${BBOX});\nout geom;`, 'arterials', ctx.log);
  const out: Feature[] = [];
  for (const el of els) {
    const line = wayLine(el, 0.0001);
    const tags = el.tags ?? {};
    if (!line || !tags.name) continue;
    out.push({ osmKey: `way/${el.id}`, properties: { name: tags.name, kind: tags.highway === 'primary' ? 'primary' : 'secondary' }, line });
  }
  return out;
}

// --- CTA 'L': route relations + subway stations, stations snapped to lines within 120 m.
const LINE_ORDER = Object.keys(CTA_LINE_COLORS) as (keyof typeof CTA_LINE_COLORS)[];

function lineNameFor(tags: Record<string, string> = {}) {
  const hay = [tags.name, tags.ref, tags.colour, tags.color].filter(Boolean).join(' ');
  for (const name of LINE_ORDER) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(hay)) return name;
    if (hay.toLowerCase().includes(CTA_LINE_COLORS[name])) return name;
  }
  return null;
}

async function fetchTransit(ctx: JobContext): Promise<{ lines: Feature[]; stations: Feature[] }> {
  const routeQuery = `[out:json][timeout:180];
(
  relation["type"="route"]["route"~"^(subway|light_rail)$"]["operator"~"CTA|Chicago Transit",i](${BBOX});
  relation["type"="route"]["route"~"^(subway|light_rail)$"]["network"~"CTA|Chicago Transit",i](${BBOX});
)->.r;
.r out body geom;`;
  const stationQuery = `[out:json][timeout:180];
(
  node["railway"="station"]["station"="subway"](${BBOX});
  way["railway"="station"]["station"="subway"](${BBOX});
);
out center tags;`;
  const relations = await overpass(ctx.env, routeQuery, 'CTA route relations', ctx.log);
  const stationEls = await overpass(ctx.env, stationQuery, 'CTA stations', ctx.log);
  const railStops = await fetchRailStops(ctx.env);

  const seen = new Set<string>();
  const lines: Feature[] = [];
  for (const rel of relations) {
    const line = lineNameFor(rel.tags);
    if (!line || !rel.members) continue;
    for (const m of rel.members) {
      if (m.type !== 'way' || m.role !== '' || !m.geometry) continue;
      const key = `${m.ref}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const raw = dedupeConsecutive(m.geometry.map((p) => [round5(p.lon), round5(p.lat)] as Coord));
      if (raw.length < 2) continue;
      lines.push({ osmKey: `way/${m.ref}#${line}`, properties: { line, color: CTA_LINE_COLORS[line] }, line: dedupeConsecutive(simplify(raw, 0.00005)) });
    }
  }

  const seenStations = new Set<string>();
  const stations: Feature[] = [];
  for (const el of stationEls) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    const name = tags.name ?? tags['name:en'] ?? '';
    if (lat === undefined || lon === undefined || !name) continue;
    const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seenStations.has(key)) continue;
    seenStations.add(key);
    const point: Coord = [round5(lon), round5(lat)];
    const served = new Set<string>();
    for (const f of lines) {
      const line = f.properties.line as string;
      if (served.has(line) || !f.line) continue;
      for (let i = 1; i < f.line.length; i++) {
        if (metersToSegment(point, f.line[i - 1]!, f.line[i]!) <= 120) { served.add(line); break; }
      }
    }
    stations.push({
      osmKey: `${el.type}/${el.id}`,
      properties: { name, lines: LINE_ORDER.filter((l) => served.has(l)).join(', '), stopId: mapIdFor(name, point, railStops) },
      point,
    });
  }
  stations.sort((a, b) => String(a.properties.name).localeCompare(String(b.properties.name)));
  const matched = stations.filter((s) => s.properties.stopId !== null).length;
  ctx.log.info({ stations: stations.length, matched, railStops: railStops.length }, 'CTA station map ids joined');
  return { lines, stations };
}

/** Punctuation and casing differ between OSM and CTA ("O'Hare" / "O Hare"). */
const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const STATION_JOIN_METERS = 300;

/**
 * OSM station nodes carry no usable `mapid`, so each one is matched to the
 * nearest CTA stop. Proximity has to lead rather than the name: CTA runs two
 * different "Belmont" stations, with different ids, on different lines. Among
 * stops that are close enough to be the same station, an exact name match
 * still wins over a few metres of distance.
 */
export function mapIdFor(name: string, point: Coord, stops: RailStop[]): string | null {
  const near = stops
    .map((stop) => ({ stop, meters: metersBetween(point, stop.point) }))
    .filter((c) => c.meters <= STATION_JOIN_METERS)
    .sort((a, b) => a.meters - b.meters);
  if (!near.length) return null;
  const exact = near.filter((c) => normalizeName(c.stop.name) === normalizeName(name));
  return (exact[0] ?? near[0])!.stop.mapId;
}

// --- CTA buses: route lines and stops from the city's published GIS extracts.
async function fetchBusRouteFeatures(ctx: JobContext): Promise<Feature[]> {
  const routes = await fetchBusRoutes(ctx.env);
  const out: Feature[] = [];
  for (const r of routes) {
    // A route is published as a MultiLineString; each part becomes its own feature.
    r.parts.forEach((part, i) => {
      const line = dedupeConsecutive(simplify(dedupeConsecutive(part.map(([x, y]) => [round5(x), round5(y)] as Coord)), 0.00005));
      if (line.length < 2) return;
      out.push({ osmKey: `cta-bus-route/${r.route}#${i}`, properties: { route: r.route, name: r.name, color: CTA_BUS_COLOR }, line });
    });
  }
  ctx.log.info({ routes: routes.length, features: out.length }, 'CTA bus routes fetched');
  return out;
}

async function fetchBusStopFeatures(ctx: JobContext): Promise<Feature[]> {
  const stops = await fetchBusStops(ctx.env);
  const out = stops.map((s, i) => ({
    osmKey: s.stopId ? `cta-bus-stop/${s.stopId}` : `cta-bus-stop/anon-${i}`,
    properties: { name: s.name, stopId: s.stopId, routes: s.routes },
    point: [round5(s.point[0]), round5(s.point[1])] as Coord,
  }));
  ctx.log.info({ stops: out.length, withStopId: out.filter((s) => s.properties.stopId).length }, 'CTA bus stops fetched');
  return out;
}

// --- Metra: route relations and stations from OSM. No API key needed.
const METRA_LINES = Object.keys(METRA_LINE_COLORS) as MetraLine[];
const isMetraLine = (ref: string): ref is MetraLine => (METRA_LINES as string[]).includes(ref);

/** Union Station is the one Metra station in Chicago with no `ref:metra` tag. */
const METRA_STATION_IDS: Record<string, string> = { chicagounionstation: 'CUS' };

function isMetra(tags: Record<string, string>) {
  return /metra/i.test(`${tags.operator ?? ''} ${tags.network ?? ''}`);
}

async function fetchMetra(ctx: JobContext): Promise<{ lines: Feature[]; stations: Feature[] }> {
  const routeQuery = `[out:json][timeout:180];
(
  relation["type"="route"]["route"="train"]["operator"~"Metra",i](${BBOX});
  relation["type"="route"]["route"="train"]["network"~"Metra",i](${BBOX});
)->.r;
.r out body geom;`;
  const stationQuery = `[out:json][timeout:180];
(
  node["railway"="station"](${BBOX});
  way["railway"="station"](${BBOX});
);
out center tags;`;
  const relations = await overpass(ctx.env, routeQuery, 'Metra route relations', ctx.log);
  const stationEls = await overpass(ctx.env, stationQuery, 'Metra stations', ctx.log);

  // OSM tags every direction and short-turn of a line as its own relation, so
  // the same way arrives many times over; keep one copy per way and line.
  const seen = new Set<string>();
  const lines: Feature[] = [];
  for (const rel of relations) {
    const ref = rel.tags?.ref?.trim() ?? '';
    if (!isMetraLine(ref) || !rel.members) continue;
    for (const m of rel.members) {
      if (m.type !== 'way' || m.role !== '' || !m.geometry) continue;
      const key = `${m.ref}:${ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const raw = dedupeConsecutive(m.geometry.map((p) => [round5(p.lon), round5(p.lat)] as Coord));
      if (raw.length < 2) continue;
      lines.push({ osmKey: `way/${m.ref}#${ref}`, properties: { line: ref, color: METRA_LINE_COLORS[ref] }, line: dedupeConsecutive(simplify(raw, 0.00005)) });
    }
  }

  const seenStations = new Set<string>();
  const stations: Feature[] = [];
  for (const el of stationEls) {
    const tags = el.tags ?? {};
    if (!isMetra(tags)) continue;
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    const name = tags.name ?? tags['name:en'] ?? '';
    if (lat === undefined || lon === undefined || !name) continue;
    const key = `${name}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seenStations.has(key)) continue;
    seenStations.add(key);
    const point: Coord = [round5(lon), round5(lat)];
    const served = new Set<string>();
    for (const f of lines) {
      const line = f.properties.line as string;
      if (served.has(line) || !f.line) continue;
      for (let i = 1; i < f.line.length; i++) {
        if (metersToSegment(point, f.line[i - 1]!, f.line[i]!) <= 120) { served.add(line); break; }
      }
    }
    const stopId = tags['ref:metra']?.trim() || METRA_STATION_IDS[normalizeName(name)] || null;
    stations.push({
      osmKey: `${el.type}/${el.id}`,
      properties: { name, stopId, lines: METRA_LINES.filter((l) => served.has(l)).join(', ') },
      point,
    });
  }
  stations.sort((a, b) => String(a.properties.name).localeCompare(String(b.properties.name)));
  ctx.log.info({ lines: lines.length, stations: stations.length }, 'Metra fetched');
  return { lines, stations };
}
