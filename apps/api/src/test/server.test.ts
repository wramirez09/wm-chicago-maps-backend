import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';
import { buildServer } from '../server.js';

/**
 * Boots the app against a DATABASE_URL that does not answer. Routes that don't
 * touch the DB (health, docs, validation errors) must still work; that's what
 * this checks. Integration tests against real PostGIS live in CI via the
 * postgis service container (see .github/workflows/ci.yml).
 */
const env = loadEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
let app: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  app = await buildServer(env);
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('server', () => {
  it('serves /v1/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
  it('exposes OpenAPI', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const paths = Object.keys(res.json().paths);
    expect(paths).toContain('/v1/places');
    expect(paths).toContain('/v1/layers/{key}');
  });
  it('validates bbox', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places?bbox=nope' });
    expect(res.statusCode).toBe(400);
  });
  it('rejects unauthenticated writes', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/places', payload: {} });
    expect(res.statusCode).toBe(401);
  });
  it('reports not-ready when the DB is down', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(503);
  });
});
