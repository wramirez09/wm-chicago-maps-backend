import { z } from 'zod';
import { LineStringGeometry, PointGeometry, feature, featureCollection } from './common.js';

/**
 * Static map overlay layers that used to be bundled into the mobile app as
 * generated TypeScript. They are now ingested into PostGIS and served as
 * GeoJSON with long cache lifetimes. Sources vary per layer — see
 * `attribution` on each layer's entry in `GET /v1/layers`.
 */
export const LayerKey = z.enum([
  'expressways',
  'arterials',
  'transit-lines',
  'transit-stations',
  'bus-routes',
  'bus-stops',
  'metra-lines',
  'metra-stations',
]);
export type LayerKey = z.infer<typeof LayerKey>;

/**
 * Upstream stop identifier, absent on features ingested before the id source
 * existed. Optional on the wire and normalised to `null`, so a run written by
 * an older ingest keeps validating.
 */
const stopId = z.string().nullable().default(null);

export const ExpresswayProperties = z.object({
  name: z.string(),
  ref: z.string(),
  kind: z.enum(['motorway', 'trunk']),
  localName: z.string(),
});
export const ArterialProperties = z.object({ name: z.string(), kind: z.enum(['primary', 'secondary']) });
export const TransitLineProperties = z.object({ line: z.string(), color: z.string() });
/** `stopId` is the CTA Train Tracker `mapid` (4xxxx), accepted by `/v1/transit/arrivals?mode=rail`. */
export const TransitStationProperties = z.object({ name: z.string(), lines: z.string(), stopId });

export const BusRouteProperties = z.object({ route: z.string(), name: z.string(), color: z.string() });
/** `stopId` is the CTA Bus Tracker `stpid`, accepted by `/v1/transit/arrivals?mode=bus`. */
export const BusStopProperties = z.object({ name: z.string(), stopId, routes: z.string() });

export const MetraLineProperties = z.object({ line: z.string(), color: z.string() });
/** `stopId` is the Metra GTFS `stop_id` (alphanumeric, e.g. `RAVENSWOOD`). */
export const MetraStationProperties = z.object({ name: z.string(), stopId, lines: z.string() });

export const ExpresswayCollection = featureCollection(feature(LineStringGeometry, ExpresswayProperties));
export const ArterialCollection = featureCollection(feature(LineStringGeometry, ArterialProperties));
export const TransitLineCollection = featureCollection(feature(LineStringGeometry, TransitLineProperties));
export const TransitStationCollection = featureCollection(feature(PointGeometry, TransitStationProperties));
export const BusRouteCollection = featureCollection(feature(LineStringGeometry, BusRouteProperties));
export const BusStopCollection = featureCollection(feature(PointGeometry, BusStopProperties));
export const MetraLineCollection = featureCollection(feature(LineStringGeometry, MetraLineProperties));
export const MetraStationCollection = featureCollection(feature(PointGeometry, MetraStationProperties));

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL';
export const CTA_GIS_ATTRIBUTION = 'Chicago Transit Authority via the Chicago Data Portal';

/**
 * Per-layer credit. Stored on each ingest run, so this is what a layer that
 * has never been ingested falls back to.
 */
export const LAYER_ATTRIBUTION: Record<LayerKey, string> = {
  'expressways': OSM_ATTRIBUTION,
  'arterials': OSM_ATTRIBUTION,
  'transit-lines': OSM_ATTRIBUTION,
  'transit-stations': `${OSM_ATTRIBUTION}; stop ids from the ${CTA_GIS_ATTRIBUTION}`,
  'bus-routes': CTA_GIS_ATTRIBUTION,
  'bus-stops': CTA_GIS_ATTRIBUTION,
  'metra-lines': OSM_ATTRIBUTION,
  'metra-stations': OSM_ATTRIBUTION,
};

export const LayerMeta = z.object({
  key: LayerKey,
  featureCount: z.number().int(),
  generatedAt: z.string().nullable(),
  attribution: z.string(),
});
export const LayerIndex = z.object({ layers: z.array(LayerMeta) });

/** Official CTA line colours; preferred over OSM's `colour` tag. */
export const CTA_LINE_COLORS = {
  Red: '#c60c30',
  Blue: '#00a1de',
  Brown: '#62361b',
  Green: '#009b3a',
  Orange: '#f9461c',
  Pink: '#e27ea6',
  Purple: '#522398',
  Yellow: '#f9e300',
} as const;

/**
 * Official Metra line colours, taken from `route_color` in Metra's published
 * GTFS `routes.txt`. OSM's `colour` tags on the same relations disagree with
 * these, so the GTFS values win.
 */
export const METRA_LINE_COLORS = {
  'BNSF': '#29c233',
  'HC': '#550e0c',
  'MD-N': '#cc5500',
  'MD-W': '#f1ad0e',
  'ME': '#eb5c00',
  'NCS': '#9785bc',
  'RI': '#e02400',
  'SWS': '#0042a8',
  'UP-N': '#008000',
  'UP-NW': '#ffe600',
  'UP-W': '#fe8d81',
} as const;
export type MetraLine = keyof typeof METRA_LINE_COLORS;

/**
 * CTA publishes no per-route bus colours, and inventing one per route would
 * imply a distinction riders do not see. Every bus route is painted in the
 * neutral grey CTA uses for buses on its own system map; the app reads
 * `['get','color']` with no fallback, so the property still has to be present.
 */
export const CTA_BUS_COLOR = '#565a5c';
