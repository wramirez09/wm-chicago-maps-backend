import 'dotenv/config';
import { z } from 'zod';

const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('').transform(csv),

  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url().optional(),

  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('wm-chicago-maps'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(90),
  APPLE_BUNDLE_ID: z.string().default('com.wmchicagomaps'),
  GOOGLE_CLIENT_IDS: z.string().default('').transform(csv),

  PHOTON_URL: z.string().url().default('http://chicago-photon.flycast'),
  VALHALLA_URL: z.string().url().default('http://chicago-valhalla.flycast'),

  SOCRATA_APP_TOKEN: z.string().optional(),
  CTA_TRAIN_KEY: z.string().optional(),
  CTA_BUS_KEY: z.string().optional(),
  METRA_API_KEY: z.string().optional(),
  TICKETMASTER_KEY: z.string().optional(),
  BANDSINTOWN_APP_ID: z.string().optional(),
  OVERPASS_URL: z.string().url().default('https://overpass-api.de/api/interpreter'),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof Env>;

/** Parsed once at boot. A missing or malformed variable fails the process immediately. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
