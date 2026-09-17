import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../env.js';

vi.mock('../upstream/photon.js', () => ({
  geocode: async (_env: unknown, q: string) =>
    q.startsWith('1060')
      ? [{ id: 'W/123', name: 'Wrigley Field', address: '1060 W Addison St, Chicago', kind: 'leisure=stadium', lng: -87.6553, lat: 41.9484 }]
      : [],
  reverse: async () => null,
}));

const env = loadEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x', JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
import type { buildServer as BuildServer } from '../server.js';
let app: Awaited<ReturnType<typeof BuildServer>>;

beforeAll(async () => {
  const { buildServer } = await import('../server.js');
  app = await buildServer(env);
  await app.ready();
});
afterAll(async () => app.close());

describe('GET /v1/geocode', () => {
  it('returns Photon hits in the shared shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=1060%20W%20Addison' });
    expect(res.statusCode).toBe(200);
    expect(res.json().hits[0]).toMatchObject({ name: 'Wrigley Field', lng: -87.6553 });
    expect(res.headers['cache-control']).toContain('max-age=600');
  });
  it('rejects one-character queries', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/geocode?q=a' });
    expect(res.statusCode).toBe(400);
  });
});
