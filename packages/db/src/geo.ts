import { type SQL, sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

type Point = { type: 'Point'; coordinates: [number, number] };
type LineString = { type: 'LineString'; coordinates: [number, number][] };
type MultiPolygon = { type: 'MultiPolygon'; coordinates: [number, number][][][] };

/**
 * PostGIS geography columns. Values cross the wire as GeoJSON: we SELECT with
 * ST_AsGeoJSON and INSERT with ST_GeomFromGeoJSON, so the driver never has to
 * understand EWKB.
 */
function geography<T extends { type: string }>(kind: T['type']) {
  return customType<{ data: T; driverData: string }>({
    dataType() {
      return `geography(${kind},4326)`;
    },
    toDriver(value) {
      return sql`ST_GeomFromGeoJSON(${JSON.stringify(value)})::geography` as unknown as string;
    },
    fromDriver(value) {
      // postgres.js returns geography as hex EWKB; we always select via ST_AsGeoJSON instead.
      return typeof value === 'string' && value.startsWith('{') ? (JSON.parse(value) as T) : (value as unknown as T);
    },
  });
}

export const geographyPoint = geography<Point>('Point');
export const geographyLineString = geography<LineString>('LineString');
export const geographyMultiPolygon = geography<MultiPolygon>('MultiPolygon');

export type { Point, LineString, MultiPolygon };

/** `ST_AsGeoJSON(col)::json` — use in select() to get parsed GeoJSON back. */
export const asGeoJson = (column: SQL | unknown): SQL => sql`ST_AsGeoJSON(${column})::json`;

/** Bounding box filter using an index-friendly envelope test. */
export const withinBbox = (column: unknown, b: { west: number; south: number; east: number; north: number }): SQL =>
  sql`ST_Intersects(${column}, ST_MakeEnvelope(${b.west}, ${b.south}, ${b.east}, ${b.north}, 4326)::geography)`;

export const withinMeters = (column: unknown, lng: number, lat: number, meters: number): SQL =>
  sql`ST_DWithin(${column}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${meters})`;

export const distanceMeters = (column: unknown, lng: number, lat: number): SQL =>
  sql`ST_Distance(${column}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)`;

export const pointFrom = (lng: number, lat: number): SQL =>
  sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

export const geomFromGeoJson = (geojson: object): SQL =>
  sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})::geography`;
