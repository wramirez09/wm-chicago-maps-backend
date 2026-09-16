import { loadEnv } from './env.js';
import { buildServer } from './server.js';

const env = loadEnv();
const app = await buildServer(env);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
