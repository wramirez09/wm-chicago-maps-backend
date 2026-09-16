import { and, asGeoJson, desc, eq, layerFeatures, layerRuns } from '@wm/db';
import { LayerIndex, LayerKey } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { cached } from '../../lib/cache.js';
import { notFound } from '../../lib/errors.js';

/**
 * Map overlays the mobile app used to bundle as ~1 MB of generated TypeScript.
 * Served as GeoJSON with an ETag derived from the current ingest run, so the
 * app can cache them for days and revalidate cheaply.
 */
export async function layersRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/layers', { schema: { tags: ['layers'], response: { 200: LayerIndex } } }, async (_req, reply) => {
    const runs = await app.db.select().from(layerRuns).where(eq(layerRuns.current, true)).orderBy(desc(layerRuns.generatedAt));
    const byKey = new Map(runs.map((x) => [x.layer, x]));
    reply.header('cache-control', 'public, max-age=3600');
    return {
      layers: LayerKey.options.map((key) => {
        const run = byKey.get(key);
        return {
          key,
          featureCount: run?.featureCount ?? 0,
          generatedAt: run?.generatedAt.toISOString() ?? null,
          attribution: run?.attribution ?? '© OpenStreetMap contributors, ODbL',
        };
      }),
    };
  });

  r.get(
    '/layers/:key',
    { schema: { tags: ['layers'], params: z.object({ key: LayerKey }), response: { 200: z.any(), 304: z.any() } } },
    async (req, reply) => {
      const [run] = await app.db.select().from(layerRuns).where(and(eq(layerRuns.layer, req.params.key), eq(layerRuns.current, true))).limit(1);
      if (!run) throw notFound('Layer has not been ingested yet');
      const etag = `"${run.id}"`;
      reply.header('etag', etag);
      reply.header('cache-control', 'public, max-age=86400, stale-while-revalidate=604800');
      if (req.headers['if-none-match'] === etag) return reply.status(304).send(undefined);

      const fc = await cached(`layer:${run.id}`, 6 * 3600_000, async () => {
        const isPoint = req.params.key === 'transit-stations';
        const rows = await app.db
          .select({ properties: layerFeatures.properties, geometry: asGeoJson(isPoint ? layerFeatures.point : layerFeatures.line) })
          .from(layerFeatures)
          .where(and(eq(layerFeatures.layer, req.params.key), eq(layerFeatures.runId, run.id)));
        return { type: 'FeatureCollection', features: rows.map((x) => ({ type: 'Feature', geometry: x.geometry, properties: x.properties })) };
      });
      return fc;
    },
  );
}
