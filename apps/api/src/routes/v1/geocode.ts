import { GeocodeQuery, GeocodeResults } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../env.js';
import { cached } from '../../lib/cache.js';
import { geocode } from '../../upstream/photon.js';

/**
 * Address and place-name search via Photon, Chicago only. The app merges
 * these under its local (offline) index results. Cached 10 min per query;
 * typical autocomplete traffic repeats prefixes heavily.
 */
export async function geocodeRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/geocode', { schema: { tags: ['places'], querystring: GeocodeQuery, response: { 200: GeocodeResults } } }, async (req, reply) => {
    const q = req.query.q;
    const hits = await cached(`geocode:${req.query.limit}:${q.toLowerCase()}`, 10 * 60_000, () => geocode(opts.env, q, req.query.limit));
    reply.header('cache-control', 'public, max-age=600');
    return { q, hits, attribution: '© OpenStreetMap contributors, ODbL · search by Photon' };
  });
}
