import {
  and, asGeoJson, count, eq, ilike, isNull, places, pointFrom, sql, submissions, vouches, withinBbox, type Point,
} from '@wm/db';
import {
  PlaceCollection, PlaceDetail, PlaceSubmission, PlacesQuery, SubmissionAccepted, Uuid, VouchResult, CHICAGO_BBOX,
} from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Env } from '../../env.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { JOBS } from '../../jobs/names.js';
import { sendJob } from '../../jobs/boss.js';

const vouchCountSql = sql<number>`(select count(*)::int from ${vouches} v where v.place_id = ${places.id})`;

export async function placesRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/places',
    { schema: { tags: ['places'], querystring: PlacesQuery, response: { 200: PlaceCollection } } },
    async (req, reply) => {
      const { bbox, category, q, limit } = req.query;
      const conds = [withinBbox(places.location, bbox), isNull(places.closedAt)];
      if (category) conds.push(eq(places.category, category));
      if (q) conds.push(ilike(places.name, `%${q}%`));
      const rows = await app.db
        .select({
          id: places.id, slug: places.slug, name: places.name, category: places.category, independence: places.independence,
          communityArea: places.communityArea, address: places.address, vouchCount: vouchCountSql, geometry: asGeoJson(places.location),
        })
        .from(places)
        .where(and(...conds))
        .limit(limit);
      reply.header('cache-control', 'public, max-age=60');
      return {
        type: 'FeatureCollection' as const,
        features: rows.map(({ geometry, ...properties }) => ({ type: 'Feature' as const, geometry: geometry as Point, properties })),
      };
    },
  );

  r.get(
    '/places/:id',
    { schema: { tags: ['places'], params: z.object({ id: Uuid }), response: { 200: PlaceDetail } } },
    async (req) => {
      const [p] = await app.db
        .select({
          id: places.id, slug: places.slug, name: places.name, category: places.category, independence: places.independence,
          independenceReason: places.independenceReason, communityArea: places.communityArea, address: places.address,
          description: places.description, hours: places.hours, hoursConfirmedAt: places.hoursConfirmedAt, website: places.website,
          phone: places.phone, tags: places.tags, createdAt: places.createdAt, updatedAt: places.updatedAt,
          vouchCount: vouchCountSql, location: asGeoJson(places.location),
        })
        .from(places)
        .where(eq(places.id, req.params.id))
        .limit(1);
      if (!p) throw notFound('Place not found');
      let viewerHasVouched = false;
      if (req.user) {
        const [v] = await app.db.select({ n: count() }).from(vouches).where(and(eq(vouches.placeId, p.id), eq(vouches.profileId, req.user.id)));
        viewerHasVouched = (v?.n ?? 0) > 0;
      }
      return {
        ...p,
        hours: p.hours ?? null,
        hoursConfirmedAt: p.hoursConfirmedAt?.toISOString() ?? null,
        location: p.location as Point,
        viewerHasVouched,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    },
  );

  r.post(
    '/places',
    { preValidation: app.requireAuth, schema: { tags: ['places'], security: [{ bearer: [] }], body: PlaceSubmission, response: { 202: SubmissionAccepted } } },
    async (req, reply) => {
      const [lng, lat] = req.body.location.coordinates;
      if (lng < CHICAGO_BBOX[0] || lng > CHICAGO_BBOX[2] || lat < CHICAGO_BBOX[1] || lat > CHICAGO_BBOX[3]) {
        throw badRequest('Location is outside Chicago');
      }
      const [s] = await app.db
        .insert(submissions)
        .values({ submittedBy: req.user!.id, payload: req.body, location: pointFrom(lng, lat) as never })
        .returning({ id: submissions.id });
      await sendJob(app, JOBS.moderationAutocheck, { submissionId: s!.id });
      return reply.status(202).send({ submissionId: s!.id, status: 'pending' as const });
    },
  );

  const vouchSchema = { tags: ['places'], security: [{ bearer: [] }], params: z.object({ id: Uuid }), response: { 200: VouchResult } };

  r.post('/places/:id/vouch', { preValidation: app.requireAuth, schema: vouchSchema }, async (req) => {
    const [exists] = await app.db.select({ id: places.id }).from(places).where(eq(places.id, req.params.id)).limit(1);
    if (!exists) throw notFound('Place not found');
    await app.db.insert(vouches).values({ placeId: req.params.id, profileId: req.user!.id }).onConflictDoNothing();
    return vouchState(app, req.params.id, req.user!.id);
  });

  r.delete('/places/:id/vouch', { preValidation: app.requireAuth, schema: vouchSchema }, async (req) => {
    await app.db.delete(vouches).where(and(eq(vouches.placeId, req.params.id), eq(vouches.profileId, req.user!.id)));
    return vouchState(app, req.params.id, req.user!.id);
  });

  void opts;
}

async function vouchState(app: FastifyInstance, placeId: string, profileId: string) {
  const [total] = await app.db.select({ n: count() }).from(vouches).where(eq(vouches.placeId, placeId));
  const [mine] = await app.db.select({ n: count() }).from(vouches).where(and(eq(vouches.placeId, placeId), eq(vouches.profileId, profileId)));
  return { placeId, vouchCount: total?.n ?? 0, viewerHasVouched: (mine?.n ?? 0) > 0 };
}
