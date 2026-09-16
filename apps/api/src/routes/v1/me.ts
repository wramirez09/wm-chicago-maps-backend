import { count, eq, profiles, submissions, vouches } from '@wm/db';
import { Profile, ProfilePatch } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { notFound } from '../../lib/errors.js';

export async function meRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  async function load(id: string) {
    const [p] = await app.db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!p) throw notFound('Profile not found');
    const [[v], [s]] = await Promise.all([
      app.db.select({ n: count() }).from(vouches).where(eq(vouches.profileId, id)),
      app.db.select({ n: count() }).from(submissions).where(eq(submissions.submittedBy, id)),
    ]);
    return {
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      homeArea: p.homeArea,
      vouchCount: v?.n ?? 0,
      submissionCount: s?.n ?? 0,
      createdAt: p.createdAt.toISOString(),
    };
  }

  r.get('/me', { preValidation: app.requireAuth, schema: { tags: ['me'], security: [{ bearer: [] }], response: { 200: Profile } } }, async (req) => load(req.user!.id));

  r.patch(
    '/me',
    { preValidation: app.requireAuth, schema: { tags: ['me'], security: [{ bearer: [] }], body: ProfilePatch, response: { 200: Profile } } },
    async (req) => {
      const patch: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
      if (req.body.displayName !== undefined) patch.displayName = req.body.displayName;
      if (req.body.homeArea !== undefined) patch.homeArea = req.body.homeArea;
      await app.db.update(profiles).set(patch).where(eq(profiles.id, req.user!.id));
      return load(req.user!.id);
    },
  );
}
