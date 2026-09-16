import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'wm-chicago-maps API',
        description: 'Backend for the Chicago-only, locally owned map app.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
});
