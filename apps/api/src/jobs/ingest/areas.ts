import { communityAreas, geomFromGeoJson, sql } from '@wm/db';
import { slugify } from '../../lib/slug.js';
import { CHICAGO_PORTAL, DATASETS, socrataFetch } from '../../upstream/socrata.js';
import type { JobHandler } from '../index.js';

type AreaFeature = {
  geometry: { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown };
  properties: { area_numbe?: string; area_num_1?: string; community?: string };
};

/** The 77 community areas from the Chicago Data Portal (Socrata GeoJSON export). Monthly; they never change. */
export const ingestAreas: JobHandler<Record<string, never>> = async ({ db, env, log }) => {
  const fc = await socrataFetch<{ features: AreaFeature[] }>(env, CHICAGO_PORTAL, DATASETS.communityAreas, { limit: 100 }, 'geojson');
  let n = 0;
  for (const f of fc.features) {
    const number = Number(f.properties.area_numbe ?? f.properties.area_num_1);
    const rawName = f.properties.community ?? '';
    if (!number || !rawName) continue;
    const name = rawName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bO'h/g, "O'H");
    const geom = f.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [f.geometry.coordinates] } : f.geometry;
    await db
      .insert(communityAreas)
      .values({ number, slug: slugify(name), name, boundary: geomFromGeoJson(geom) as never })
      .onConflictDoUpdate({ target: communityAreas.number, set: { name, boundary: geomFromGeoJson(geom) as never, updatedAt: sql`now()` } });
    n++;
  }
  log.info({ areas: n }, 'community areas ingested');
};
