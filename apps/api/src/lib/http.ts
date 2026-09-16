import { fetch, type RequestInit } from 'undici';

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number | null,
    message: string,
  ) {
    super(`${service}: ${message}`);
    this.name = 'UpstreamError';
  }
}

type Opts = RequestInit & { timeoutMs?: number; retries?: number; service: string };

/**
 * One fetch wrapper for every upstream call: hard timeout, one retry on 5xx or
 * network failure, and an error type routes can map to 502 without leaking
 * upstream details.
 */
export async function fetchJson<T>(url: string, opts: Opts): Promise<T> {
  const { timeoutMs = 8000, retries = 1, service, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ac.signal,
        headers: { accept: 'application/json', 'user-agent': 'wm-chicago-maps-api/0.1', ...(init.headers ?? {}) },
      });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new UpstreamError(service, res.status, `HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new UpstreamError(service, res.status, `HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      lastErr = err;
      if (attempt >= retries) break;
    } finally {
      clearTimeout(timer);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new UpstreamError(service, null, msg);
}

export async function fetchText(url: string, opts: Opts): Promise<string> {
  const { timeoutMs = 60000, service, ...init } = opts;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal, headers: { 'user-agent': 'wm-chicago-maps-api/0.1', ...(init.headers ?? {}) } });
    if (!res.ok) throw new UpstreamError(service, res.status, `HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
