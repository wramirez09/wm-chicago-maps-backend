import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, { value: unknown; expiresAt: number }>({ max: 2000 });

/** In-process TTL cache for upstream responses. Per machine; fine for 30s–24h data. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
