import { events, pointFrom, sql } from '@wm/db';
import { CHICAGO_CENTER } from '@wm/shared';
import { fetchJson } from '../../lib/http.js';
import type { JobHandler } from '../index.js';

type TmEvent = {
  id: string; name: string; url?: string;
  dates: { start: { dateTime?: string; localDate?: string }; end?: { dateTime?: string } };
  priceRanges?: { min?: number }[];
  _embedded?: { venues?: { name?: string; location?: { longitude?: string; latitude?: string } }[] };
};
type TmResponse = { _embedded?: { events?: TmEvent[] }; page?: { totalPages?: number } };

/** Hourly Ticketmaster Discovery pull within ~15 km of the Loop. Bandsintown and Park District land with /add-chicago-apis events. */
export const ingestEvents: JobHandler<Record<string, never>> = async ({ db, env, log }) => {
  if (!env.TICKETMASTER_KEY) {
    log.warn({}, 'TICKETMASTER_KEY not set; skipping events ingest');
    return;
  }
  let upserted = 0;
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    url.searchParams.set('apikey', env.TICKETMASTER_KEY);
    url.searchParams.set('latlong', `${CHICAGO_CENTER[1]},${CHICAGO_CENTER[0]}`);
    url.searchParams.set('radius', '15');
    url.searchParams.set('unit', 'km');
    url.searchParams.set('size', '200');
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'date,asc');
    const data = await fetchJson<TmResponse>(url.toString(), { service: 'ticketmaster', timeoutMs: 20_000 });
    const list = data._embedded?.events ?? [];
    for (const e of list) {
      const v = e._embedded?.venues?.[0];
      const lng = Number(v?.location?.longitude), lat = Number(v?.location?.latitude);
      const startsAt = e.dates.start.dateTime ?? (e.dates.start.localDate ? `${e.dates.start.localDate}T19:00:00-06:00` : null);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || !startsAt) continue;
      const row = {
        title: e.name, startsAt: new Date(startsAt), endsAt: e.dates.end?.dateTime ? new Date(e.dates.end.dateTime) : null,
        venueName: v?.name ?? null, location: pointFrom(lng, lat) as never, source: 'ticketmaster' as const, externalId: e.id,
        url: e.url ?? null, free: e.priceRanges?.[0]?.min === 0 ? true : null, raw: e,
      };
      await db.insert(events).values(row).onConflictDoUpdate({ target: [events.source, events.externalId], set: { ...row, updatedAt: sql`now()` } });
      upserted++;
    }
    if (page + 1 >= (data.page?.totalPages ?? 1)) break;
  }
  log.info({ upserted }, 'events ingested');
};
