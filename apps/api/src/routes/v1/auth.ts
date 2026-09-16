import { and, eq, identities, isNull, profiles, refreshTokens } from '@wm/db';
import { NativeSignIn, RefreshRequest, TokenPair } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../../env.js';
import { unauthorized } from '../../lib/errors.js';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Native sign-in: the app gets an identity token from Apple or Google on
 * device, posts it here, and we exchange it for our own access + refresh pair.
 */
export async function authRoutes(app: FastifyInstance, opts: { env: Env }) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { env } = opts;

  async function issuePair(profileId: string, role: 'user' | 'owner' | 'moderator' | 'admin') {
    const accessToken = await app.signAccessToken({ id: profileId, role });
    const raw = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await app.db.insert(refreshTokens).values({ profileId, tokenHash: sha256(raw), expiresAt });
    return { accessToken, refreshToken: raw, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
  }

  r.post(
    '/auth/native',
    { schema: { tags: ['auth'], body: NativeSignIn, response: { 200: TokenPair } } },
    async (req) => {
      const { provider, identityToken, displayName } = req.body;
      let subject: string;
      let email: string | null = null;
      try {
        if (provider === 'apple') {
          const { payload } = await jwtVerify(identityToken, APPLE_JWKS, { issuer: 'https://appleid.apple.com', audience: env.APPLE_BUNDLE_ID });
          subject = payload.sub!;
          email = (payload.email as string | undefined) ?? null;
        } else {
          const { payload } = await jwtVerify(identityToken, GOOGLE_JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.GOOGLE_CLIENT_IDS });
          subject = payload.sub!;
          email = (payload.email as string | undefined) ?? null;
        }
      } catch (err) {
        req.log.info({ err, provider }, 'identity token rejected');
        throw unauthorized('Identity token rejected');
      }

      const existing = await app.db
        .select({ profileId: identities.profileId, role: profiles.role })
        .from(identities)
        .innerJoin(profiles, eq(profiles.id, identities.profileId))
        .where(and(eq(identities.provider, provider), eq(identities.subject, subject)))
        .limit(1);

      if (existing[0]) return issuePair(existing[0].profileId, existing[0].role);

      const created = await app.db.transaction(async (tx) => {
        const [p] = await tx.insert(profiles).values({ displayName: displayName?.trim() || 'Neighbor' }).returning({ id: profiles.id, role: profiles.role });
        await tx.insert(identities).values({ provider, subject, profileId: p!.id, email });
        return p!;
      });
      return issuePair(created.id, created.role);
    },
  );

  r.post(
    '/auth/refresh',
    { schema: { tags: ['auth'], body: RefreshRequest, response: { 200: TokenPair } } },
    async (req) => {
      const hash = sha256(req.body.refreshToken);
      const rows = await app.db
        .select({ id: refreshTokens.id, profileId: refreshTokens.profileId, expiresAt: refreshTokens.expiresAt, role: profiles.role })
        .from(refreshTokens)
        .innerJoin(profiles, eq(profiles.id, refreshTokens.profileId))
        .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
        .limit(1);
      const row = rows[0];
      if (!row || row.expiresAt.getTime() < Date.now()) throw unauthorized('Refresh token invalid');
      // Rotate: revoke the old one, issue a new pair.
      await app.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, row.id));
      return issuePair(row.profileId, row.role);
    },
  );

  r.post(
    '/auth/logout',
    { schema: { tags: ['auth'], body: RefreshRequest, response: { 204: z.null() } } },
    async (req, reply) => {
      await app.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(req.body.refreshToken)));
      return reply.status(204).send(null);
    },
  );
}
