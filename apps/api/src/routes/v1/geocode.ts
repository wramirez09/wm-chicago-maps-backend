import { GeocodeCollection, GeocodeQuery } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../env.js';
import { cached } from '../../lib/cache.js';
import { geocode } from '../../upstream/photon.js';

/**
 * Address and place-name search via Photon, Chicago only. Returns a Point
 * FeatureCollection the app merges under its local index results. Photon
 * failures surface as 502 "photon unavailable" via the shared error handler,
 * the same way /v1/route reports Valhalla being down.
 */
export async function geocodeRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/geocode', { schema: { tags: ['places'], querystring: GeocodeQuery, response: { 200: GeocodeCollection } } }, async (req, reply) => {
    const { q, limit } = req.query;
    const features = await cached(`geocode:${limit}:${q.toLowerCase()}`, 60 * 60_000, () => geocode(opts.env, q, limit));
    // Addresses don't move; the app treats results as fresh for a day.
    reply.header('cache-control', 'public, max-age=86400');
    return { type: 'FeatureCollection' as const, features };
  });
}
