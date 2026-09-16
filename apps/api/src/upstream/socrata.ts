import type { Env } from '../env.js';
import { fetchJson } from '../lib/http.js';

/**
 * Socrata SODA 2.x client for data.cityofchicago.org (and datacatalog.cookcountyil.gov).
 * Dataset ids are the 4x4 codes in each dataset's URL; verify them in the
 * portal before relying on them — they are stable but occasionally replaced.
 */
export const CHICAGO_PORTAL = 'https://data.cityofchicago.org';
export const COOK_PORTAL = 'https://datacatalog.cookcountyil.gov';

export const DATASETS = {
  businessLicensesCurrent: 'uupf-x98q',
  businessOwners: 'ezma-pppn',
  communityAreas: 'igwz-8jzy',
  wards: 'p293-wvbd',
  parks: 'ejsh-fztr',
  landmarks: 'tgcp-8s9i',
} as const;

export type SocrataQuery = {
  where?: string;
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
  q?: string;
};

export function socrataUrl(portal: string, dataset: string, q: SocrataQuery = {}, format: 'json' | 'geojson' = 'json') {
  const u = new URL(`${portal}/resource/${dataset}.${format}`);
  if (q.where) u.searchParams.set('$where', q.where);
  if (q.select) u.searchParams.set('$select', q.select);
  if (q.order) u.searchParams.set('$order', q.order);
  if (q.q) u.searchParams.set('$q', q.q);
  u.searchParams.set('$limit', String(q.limit ?? 1000));
  if (q.offset) u.searchParams.set('$offset', String(q.offset));
  return u.toString();
}

export async function socrataFetch<T>(env: Env, portal: string, dataset: string, q: SocrataQuery = {}, format: 'json' | 'geojson' = 'json'): Promise<T> {
  const headers: Record<string, string> = {};
  if (env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = env.SOCRATA_APP_TOKEN;
  return fetchJson<T>(socrataUrl(portal, dataset, q, format), { service: 'socrata', headers, timeoutMs: 30_000 });
}

/** Page through a whole dataset. Yields arrays of rows, 1000 at a time. */
export async function* socrataPages<T>(env: Env, portal: string, dataset: string, q: SocrataQuery = {}) {
  const limit = q.limit ?? 1000;
  for (let offset = 0; ; offset += limit) {
    const page = await socrataFetch<T[]>(env, portal, dataset, { ...q, limit, offset });
    if (page.length === 0) return;
    yield page;
    if (page.length < limit) return;
  }
}
