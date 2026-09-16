import type { Env } from '../env.js';
import { fetchJson, UpstreamError } from '../lib/http.js';

type TrainArrival = { rt: string; destNm: string; arrT: string; isApp: string; isSch: string; isDly: string; staNm: string };
type TrainResponse = { ctatt: { errCd: string; errNm: string | null; eta?: TrainArrival[] } };

/** CTA Train Tracker — arrivals for a station (`mapid`, 4xxxx) or stop (`stpid`, 3xxxx). */
export async function trainArrivals(env: Env, stop: string) {
  if (!env.CTA_TRAIN_KEY) throw new UpstreamError('cta-train', null, 'CTA_TRAIN_KEY not configured');
  const param = stop.startsWith('4') ? 'mapid' : 'stpid';
  const url = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${env.CTA_TRAIN_KEY}&${param}=${encodeURIComponent(stop)}&outputType=JSON`;
  const data = await fetchJson<TrainResponse>(url, { service: 'cta-train' });
  if (data.ctatt.errCd !== '0') throw new UpstreamError('cta-train', null, data.ctatt.errNm ?? `error ${data.ctatt.errCd}`);
  const now = Date.now();
  return (data.ctatt.eta ?? []).map((e) => {
    const arrivesAt = parseCtaTime(e.arrT);
    return {
      route: e.rt,
      destination: e.destNm,
      arrivesAt: arrivesAt.toISOString(),
      minutes: Math.max(0, Math.round((arrivesAt.getTime() - now) / 60_000)),
      live: e.isSch === '0',
      delayed: e.isDly === '1',
    };
  });
}

type BusPrediction = { rt: string; des: string; prdtm: string; prdctdn: string; dly: boolean };
type BusResponse = { 'bustime-response': { prd?: BusPrediction[]; error?: { msg: string }[] } };

/** CTA Bus Tracker v2 — predictions for a stop id. */
export async function busArrivals(env: Env, stop: string) {
  if (!env.CTA_BUS_KEY) throw new UpstreamError('cta-bus', null, 'CTA_BUS_KEY not configured');
  const url = `https://www.ctabustracker.com/bustime/api/v2/getpredictions?key=${env.CTA_BUS_KEY}&stpid=${encodeURIComponent(stop)}&format=json`;
  const data = await fetchJson<BusResponse>(url, { service: 'cta-bus' });
  const body = data['bustime-response'];
  if (body.error?.length) throw new UpstreamError('cta-bus', null, body.error[0]?.msg ?? 'error');
  return (body.prd ?? []).map((p) => {
    const arrivesAt = parseCtaTime(p.prdtm);
    const mins = p.prdctdn === 'DUE' ? 0 : Number(p.prdctdn);
    return { route: p.rt, destination: p.des, arrivesAt: arrivesAt.toISOString(), minutes: Number.isNaN(mins) ? 0 : mins, live: true, delayed: Boolean(p.dly) };
  });
}

/** CTA timestamps are "YYYYMMDD HH:mm" or ISO-ish local time, America/Chicago. */
export function parseCtaTime(s: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}` : s;
  return chicagoLocalToDate(iso);
}

/** Interpret a naive local timestamp as America/Chicago without a tz library. */
export function chicagoLocalToDate(naiveIso: string): Date {
  const guess = new Date(`${naiveIso}Z`);
  const offsetMin = chicagoOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

function chicagoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-6';
  const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(tz);
  if (!m) return -360;
  return Number(m[1]) * 60 + (m[2] ? Math.sign(Number(m[1])) * Number(m[2]) : 0);
}
