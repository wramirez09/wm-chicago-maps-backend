import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { geographyLineString, geographyPoint } from '../geo.js';
import { layerKeyEnum } from './enums.js';

/**
 * Map overlay features ingested from OpenStreetMap. One row per feature; the
 * whole layer is served as a FeatureCollection with an ETag from `layer_runs`.
 */
export const layerFeatures = pgTable(
  'layer_features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    layer: layerKeyEnum('layer').notNull(),
    osmKey: text('osm_key').notNull(),
    properties: jsonb('properties').notNull(),
    line: geographyLineString('line'),
    point: geographyPoint('point'),
    runId: uuid('run_id').notNull(),
  },
  (t) => [
    index('layer_features_layer_idx').on(t.layer, t.runId),
    index('layer_features_line_gix').using('gist', t.line),
    index('layer_features_point_gix').using('gist', t.point),
  ],
);

export const layerRuns = pgTable('layer_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  layer: layerKeyEnum('layer').notNull(),
  featureCount: integer('feature_count').notNull(),
  attribution: text('attribution').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Only one run per layer is current; older runs are pruned by the ingest job. */
  current: boolean('current').notNull().default(false),
});
