import { and, auditLog, count, desc, eq, geomFromGeoJson, places, submissions } from '@wm/db';
import { ModDecision, ModResult, PlaceSubmission, Queue, QueueQuery, Uuid } from '@wm/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';

export async function modRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const mod = app.requireRole('moderator');

  r.get('/mod/queue', { preValidation: mod, schema: { tags: ['mod'], security: [{ bearer: [] }], querystring: QueueQuery, response: { 200: Queue } } }, async (req) => {
    const { status, limit, offset } = req.query;
    const [rows, [total]] = await Promise.all([
      app.db.select().from(submissions).where(eq(submissions.status, status)).orderBy(desc(submissions.createdAt)).limit(limit).offset(offset),
      app.db.select({ n: count() }).from(submissions).where(eq(submissions.status, status)),
    ]);
    return {
      total: total?.n ?? 0,
      items: rows.map((s) => ({
        id: s.id,
        submittedBy: s.submittedBy,
        submittedAt: s.createdAt.toISOString(),
        status: s.status,
        autochecks: (s.autochecks as { duplicateOf: string | null; insideChicago: boolean; licenseMatch: string | null } | null) ?? null,
        submission: PlaceSubmission.parse(s.payload),
      })),
    };
  });

  const decisionSchema = { tags: ['mod'], security: [{ bearer: [] }], params: z.object({ id: Uuid }), body: ModDecision, response: { 200: ModResult } };

  r.post('/mod/:id/approve', { preValidation: mod, schema: decisionSchema }, async (req) => {
    const [s] = await app.db.select().from(submissions).where(eq(submissions.id, req.params.id)).limit(1);
    if (!s) throw notFound('Submission not found');
    if (s.status !== 'pending') throw conflict(`Submission already ${s.status}`);
    const payload = PlaceSubmission.parse(s.payload);

    const placeId = await app.db.transaction(async (tx) => {
      const base = slugify(payload.name);
      const [taken] = await tx.select({ n: count() }).from(places).where(eq(places.slug, base));
      const slug = taken?.n ? `${base}-${s.id.slice(0, 6)}` : base;
      const [p] = await tx
        .insert(places)
        .values({
          slug, name: payload.name, category: payload.category, independence: 'vouched',
          independenceReason: payload.whyIndependent ?? 'Community submission approved by a moderator',
          address: payload.address ?? null, description: payload.description ?? null, website: payload.website ?? null,
          location: geomFromGeoJson(payload.location) as never,
        })
        .returning({ id: places.id });
      await tx.update(submissions).set({ status: 'approved', decidedBy: req.user!.id, decidedAt: new Date(), decisionReason: req.body.reason ?? null, placeId: p!.id, updatedAt: new Date() }).where(eq(submissions.id, s.id));
      await tx.insert(auditLog).values({ actorId: req.user!.id, action: 'submission.approve', target: s.id, detail: { placeId: p!.id } });
      return p!.id;
    });
    return { submissionId: s.id, status: 'approved' as const, placeId };
  });

  r.post('/mod/:id/reject', { preValidation: mod, schema: decisionSchema }, async (req) => {
    const [s] = await app.db.select({ id: submissions.id, status: submissions.status }).from(submissions).where(and(eq(submissions.id, req.params.id))).limit(1);
    if (!s) throw notFound('Submission not found');
    if (s.status !== 'pending') throw conflict(`Submission already ${s.status}`);
    await app.db.update(submissions).set({ status: 'rejected', decidedBy: req.user!.id, decidedAt: new Date(), decisionReason: req.body.reason ?? null, updatedAt: new Date() }).where(eq(submissions.id, s.id));
    await app.db.insert(auditLog).values({ actorId: req.user!.id, action: 'submission.reject', target: s.id, detail: { reason: req.body.reason ?? null } });
    return { submissionId: s.id, status: 'rejected' as const, placeId: null };
  });
}
