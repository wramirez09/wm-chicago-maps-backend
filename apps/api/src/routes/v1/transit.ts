import { Arrivals, ArrivalsQuery, DivvyStations } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../env.js';
import { cached } from '../../lib/cache.js';
import { badRequest } from '../../lib/errors.js';
import { busArrivals, trainArrivals } from '../../upstream/cta.js';
import { divvyStations } from '../../upstream/divvy.js';

export async function transitRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/transit/arrivals', { schema: { tags: ['transit'], querystring: ArrivalsQuery, response: { 200: Arrivals } } }, async (req, reply) => {
    const { stop, mode } = req.query;
    if (mode === 'metra') throw badRequest('Metra arrivals not implemented yet');
    const arrivals = await cached(`arrivals:${mode}:${stop}`, 30_000, () => (mode === 'rail' ? trainArrivals(opts.env, stop) : busArrivals(opts.env, stop)));
    reply.header('cache-control', 'public, max-age=30');
    return { stop, mode, fetchedAt: new Date().toISOString(), arrivals };
  });

  r.get('/transit/divvy', { schema: { tags: ['transit'], response: { 200: DivvyStations } } }, async (_req, reply) => {
    const stations = await cached('divvy', 60_000, divvyStations);
    reply.header('cache-control', 'public, max-age=60');
    return { fetchedAt: new Date().toISOString(), stations };
  });
}
