import { and, asGeoJson, events, gte, lte, withinBbox, type Point } from '@wm/db';
import { EventCollection, EventsQuery } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export async function eventsRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/events', { schema: { tags: ['events'], querystring: EventsQuery, response: { 200: EventCollection } } }, async (req, reply) => {
    const { bbox, limit } = req.query;
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date(from.getTime() + 7 * 86_400_000);
    const rows = await app.db
      .select({
        id: events.id, title: events.title, startsAt: events.startsAt, endsAt: events.endsAt, venueName: events.venueName,
        placeId: events.placeId, source: events.source, url: events.url, free: events.free, geometry: asGeoJson(events.location),
      })
      .from(events)
      .where(and(withinBbox(events.location, bbox), gte(events.startsAt, from), lte(events.startsAt, to)))
      .orderBy(events.startsAt)
      .limit(limit);
    reply.header('cache-control', 'public, max-age=300');
    return {
      type: 'FeatureCollection' as const,
      features: rows.map(({ geometry, startsAt, endsAt, ...rest }) => ({
        type: 'Feature' as const,
        geometry: geometry as Point,
        properties: { ...rest, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null },
      })),
    };
  });
}
