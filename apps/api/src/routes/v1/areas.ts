import { and, areaChanges, asGeoJson, communityAreas, count, desc, eq, gte, isNull, places, type MultiPolygon } from '@wm/db';
import { AreaChanges, AreaChangesQuery, AreaCollection, AreaDetail, Slug } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';

export async function areasRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const placeCount = (slug: typeof communityAreas.slug) =>
    app.db.$count(places, and(eq(places.communityArea, slug), isNull(places.closedAt)));

  r.get('/areas', { schema: { tags: ['areas'], response: { 200: AreaCollection } } }, async (_req, reply) => {
    const rows = await app.db
      .select({
        number: communityAreas.number, slug: communityAreas.slug, name: communityAreas.name,
        placeCount: placeCount(communityAreas.slug), geometry: asGeoJson(communityAreas.boundary),
      })
      .from(communityAreas)
      .orderBy(communityAreas.number);
    reply.header('cache-control', 'public, max-age=3600');
    return {
      type: 'FeatureCollection' as const,
      features: rows.map(({ geometry, ...properties }) => ({ type: 'Feature' as const, geometry: geometry as MultiPolygon, properties })),
    };
  });

  r.get('/areas/:slug', { schema: { tags: ['areas'], params: z.object({ slug: Slug }), response: { 200: AreaDetail } } }, async (req) => {
    const [a] = await app.db
      .select({
        number: communityAreas.number, slug: communityAreas.slug, name: communityAreas.name, summary: communityAreas.summary,
        imageUrl: communityAreas.imageUrl, attribution: communityAreas.attribution, placeCount: placeCount(communityAreas.slug),
        boundary: asGeoJson(communityAreas.boundary),
      })
      .from(communityAreas)
      .where(eq(communityAreas.slug, req.params.slug))
      .limit(1);
    if (!a) throw notFound('Community area not found');
    return { ...a, boundary: a.boundary as MultiPolygon };
  });

  r.get(
    '/areas/:slug/changes',
    { schema: { tags: ['areas'], params: z.object({ slug: Slug }), querystring: AreaChangesQuery, response: { 200: AreaChanges } } },
    async (req) => {
      const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86_400_000);
      const [exists] = await app.db.select({ n: count() }).from(communityAreas).where(eq(communityAreas.slug, req.params.slug));
      if (!exists?.n) throw notFound('Community area not found');
      const rows = await app.db
        .select()
        .from(areaChanges)
        .where(and(eq(areaChanges.communityArea, req.params.slug), gte(areaChanges.occurredAt, since)))
        .orderBy(desc(areaChanges.occurredAt))
        .limit(200);
      return {
        area: req.params.slug,
        since: since.toISOString(),
        changes: rows.map((c) => ({ kind: c.kind, occurredAt: c.occurredAt.toISOString(), placeId: c.placeId, name: c.name, address: c.address, detail: c.detail })),
      };
    },
  );
}
