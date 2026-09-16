import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import underPressure from '@fastify/under-pressure';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Env } from './env.js';
import { registerErrorHandler } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import dbPlugin from './plugins/db.js';
import swaggerPlugin from './plugins/swagger.js';
import { registerRoutes } from './routes/v1/index.js';

export async function buildServer(env: Env) {
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    trustProxy: true,
    requestIdHeader: 'fly-request-id',
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  if (env.SENTRY_DSN) Sentry.setupFastifyErrorHandler(app as unknown as Parameters<typeof Sentry.setupFastifyErrorHandler>[0]);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', allowList: ['127.0.0.1'] });
  await app.register(underPressure, { maxEventLoopDelay: 1000, maxHeapUsedBytes: 900_000_000, exposeStatusRoute: false });
  await app.register(swaggerPlugin);
  await app.register(dbPlugin, { env });
  await app.register(authPlugin, { env });

  await app.register(registerRoutes, { env, prefix: '/v1' });

  return app;
}
