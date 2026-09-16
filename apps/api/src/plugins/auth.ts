import { eq, profiles, type Db } from '@wm/db';
import type { Role } from '@wm/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../env.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export type AuthUser = { id: string; role: Role };

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    signAccessToken(user: AuthUser): Promise<string>;
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (min: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const RANK: Record<Role, number> = { user: 0, owner: 1, moderator: 2, admin: 3 };

/**
 * Bearer JWTs issued by this API (see routes/v1/auth.ts). HS256 with a shared
 * secret is fine while there is exactly one service verifying tokens; move to
 * RS256 + JWKS if a second service ever needs to verify them.
 */
export default fp(async (app, opts: { env: Env }) => {
  const key = new TextEncoder().encode(opts.env.JWT_SECRET);
  const issuer = opts.env.JWT_ISSUER;

  app.decorateRequest('user', null);

  app.decorate('signAccessToken', async (user: AuthUser) =>
    new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(issuer)
      .setAudience('mobile')
      .setIssuedAt()
      .setExpirationTime(`${opts.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(key),
  );

  // Attach the user if a valid token is present; never fail here — routes decide.
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    try {
      const { payload } = await jwtVerify(header.slice(7), key, { issuer, audience: 'mobile' });
      if (payload.sub) req.user = { id: payload.sub, role: (payload.role as Role) ?? 'user' };
    } catch {
      req.user = null;
    }
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
  });

  app.decorate('requireRole', (min: Role) => async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
    // Role is read from the DB, not the token, so a demotion takes effect immediately.
    const role = await currentRole(app.db, req.user.id);
    if (!role || RANK[role] < RANK[min]) throw forbidden();
    req.user.role = role;
  });
});

async function currentRole(db: Db, id: string): Promise<Role | null> {
  const row = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, id)).limit(1);
  return row[0]?.role ?? null;
}
