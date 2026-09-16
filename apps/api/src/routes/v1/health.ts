import { sql } from '@wm/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const Ready = z.object({ ok: z.boolean(), db: z.boolean(), postgis: z.string().nullable() });

export async function healthRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/health', { schema: { tags: ['ops'], response: { 200: z.object({ ok: z.literal(true) }) } } }, async () => ({ ok: true as const }));

  r.get(
    '/ready',
    { schema: { tags: ['ops'], response: { 200: Ready, 503: Ready } } },
    async (_req, reply) => {
      try {
        const rows = await app.db.execute(sql`select postgis_version() as v`);
        const v = (rows[0] as { v?: string } | undefined)?.v ?? null;
        return { ok: true, db: true, postgis: v };
      } catch {
        return reply.status(503).send({ ok: false, db: false, postgis: null });
      }
    },
  );
}
