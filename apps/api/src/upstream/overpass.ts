import type { Env } from '../env.js';
import { UpstreamError } from '../lib/http.js';
import { fetch } from 'undici';

export type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
};

/** Overpass is slow and rate-limited; ingest jobs only, never in a request path. */
export async function overpass(env: Env, query: string, label: string, log?: { info: (o: unknown, m?: string) => void }): Promise<OverpassElement[]> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(env.OVERPASS_URL, {
        method: 'POST',
        headers: { 'user-agent': 'wm-chicago-maps-api/0.1 (ingest)', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(200_000),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        const json = JSON.parse(text) as { elements: OverpassElement[] };
        log?.info({ label, elements: json.elements.length }, 'overpass ok');
        return json.elements;
      }
      log?.info({ label, attempt, status: res.status }, 'overpass failed');
    } catch (err) {
      log?.info({ label, attempt, err: String(err) }, 'overpass error');
    }
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
  }
  throw new UpstreamError('overpass', null, `${label} failed after 5 attempts`);
}
