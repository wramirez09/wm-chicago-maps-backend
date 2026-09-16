import { RouteQuery, RouteResult } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from '../../env.js';
import { route } from '../../upstream/valhalla.js';

const parse = (s: string) => s.split(',').map(Number) as [number, number];

export async function routeRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/route', { schema: { tags: ['route'], querystring: RouteQuery, response: { 200: RouteResult } } }, async (req) =>
    route(opts.env, parse(req.query.from), parse(req.query.to), req.query.mode),
  );
}
