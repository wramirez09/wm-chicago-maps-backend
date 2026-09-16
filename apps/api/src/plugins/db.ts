import { createDb, type Db } from '@wm/db';
import fp from 'fastify-plugin';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export default fp(async (app, opts: { env: Env }) => {
  const { db, close } = createDb(opts.env.DATABASE_URL, { max: 10, prepare: false });
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await close();
  });
});
