import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/x', JWT_SECRET: 'x'.repeat(40) };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.PHOTON_URL).toContain('flycast');
    expect(env.GOOGLE_CLIENT_IDS).toEqual([]);
  });
  it('fails loudly on a missing secret', () => {
    expect(() => loadEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });
  it('splits csv lists', () => {
    expect(loadEnv({ ...base, CORS_ORIGINS: 'a.com, b.com' }).CORS_ORIGINS).toEqual(['a.com', 'b.com']);
  });
});
