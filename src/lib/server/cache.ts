import { getDb } from './db';

interface CacheRecord {
  payload: string;
  expires_at: string;
}

export function getCache<T>(key: string): T | null {
  const db = getDb();
  const row = db
    .prepare('SELECT payload, expires_at FROM query_cache WHERE cache_key = ?')
    .get(key) as CacheRecord | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM query_cache WHERE cache_key = ?').run(key);
    return null;
  }

  return JSON.parse(row.payload) as T;
}

export function setCache<T>(key: string, value: T, ttlSeconds: number): void {
  const db = getDb();
  const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO query_cache (cache_key, payload, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload = excluded.payload,
      expires_at = excluded.expires_at,
      created_at = CURRENT_TIMESTAMP
    `
  ).run(key, JSON.stringify(value), expires);
}

export function pruneExpiredCache(): number {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM query_cache WHERE datetime(expires_at) <= datetime(CURRENT_TIMESTAMP)')
    .run();
  return result.changes;
}
