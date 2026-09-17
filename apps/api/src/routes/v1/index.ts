import type { FastifyInstance } from 'fastify';
import type { Env } from '../../env.js';
import { areasRoutes } from './areas.js';
import { authRoutes } from './auth.js';
import { eventsRoutes } from './events.js';
import { geocodeRoutes } from './geocode.js';
import { healthRoutes } from './health.js';
import { layersRoutes } from './layers.js';
import { meRoutes } from './me.js';
import { modRoutes } from './mod.js';
import { placesRoutes } from './places.js';
import { routeRoutes } from './route.js';
import { transitRoutes } from './transit.js';

export async function registerRoutes(app: FastifyInstance, { env }: { env: Env }) {
  // Only pass what sub-plugins need; forwarding `opts` would re-apply the /v1 prefix.
  const opts = { env };
  await app.register(healthRoutes);
  await app.register(authRoutes, opts);
  await app.register(meRoutes);
  await app.register(placesRoutes, opts);
  await app.register(geocodeRoutes, opts);
  await app.register(areasRoutes);
  await app.register(eventsRoutes);
  await app.register(layersRoutes);
  await app.register(transitRoutes, opts);
  await app.register(routeRoutes, opts);
  await app.register(modRoutes);
}
