/**
 * cache.service.ts — Redis Caching Layer (NFR-09: API response < 100ms)
 *
 * Chien luoc cache:
 * - Cache-Aside Pattern: App tu kiem tra cache, miss → DB → write-through.
 * - TTL theo loai du lieu:
 *   - Submission result (ket qua cham): 5 phut (du lieu tuong doi on dinh sau khi COMPLETED)
 *   - Dashboard stats (ty le nop bai, phan bo diem): 2 phut (cap nhat thuong xuyen hon)
 *   - Top-10 plagiarism pairs: 3 phut (chi thay doi khi co bai nop moi)
 * - Invalidation: xoa cache khi co write lien quan (nop bai moi, ket qua cap nhat, appeal resolve).
 */

import Redis from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
// Redis client singleton
// ─────────────────────────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let _client: Redis | null = null;
let _initAttempted = false;

function getRedisClient(): Redis | null {
  if (_initAttempted) return _client;
  _initAttempted = true;

  try {
    _client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      lazyConnect: true,
    });

    _client.on("error", (err) => {
      console.warn(`[CacheService] Redis error (graceful degradation): ${err.message}`);
    });
    _client.on("connect", () => {
      console.log("[CacheService] Connected to Redis");
    });

    _client.connect().catch(() => {
      console.warn("[CacheService] Redis unavailable — cache disabled, serving from DB");
    });

    return _client;
  } catch {
    console.warn("[CacheService] Could not initialize Redis client");
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTL Constants (giay)
// ─────────────────────────────────────────────────────────────────────────────
export const TTL = {
  SUBMISSION_RESULT: 300,
  DASHBOARD_STATS: 120,
  PLAGIARISM_TOP10: 180,
  ASSIGNMENT_LIST: 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache Key Builders
// ─────────────────────────────────────────────────────────────────────────────
export const CacheKey = {
  submissionResult: (id: string) => `aita:submission:result:${id}`,
  dashboardStats: (lecturerId: string, classId?: string) =>
    classId
      ? `aita:dashboard:stats:lecturer:${lecturerId}:class:${classId}`
      : `aita:dashboard:stats:lecturer:${lecturerId}`,
  plagiarismTop10: (assignmentId: string) => `aita:plagiarism:top10:${assignmentId}`,
  assignmentList: (classId: string) => `aita:assignments:class:${classId}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    /* silent — graceful degradation */
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedisClient();
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch {
    /* silent */
  }
}

export async function invalidateByPattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== "0");
  } catch {
    /* silent */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache-Aside Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache-Aside wrapper.
 * Tu dong: check cache → miss → goi fetcher() → luu cache → tra ve.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  cacheSet(key, fresh, ttlSeconds).catch(() => {});
  return fresh;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain Invalidation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Goi sau khi Worker cap nhat ket qua bai nop (COMPLETED / SCORE_WITHHELD) */
export async function invalidateSubmissionCache(
  submissionId: string,
  assignmentId: string
): Promise<void> {
  await cacheDel(
    CacheKey.submissionResult(submissionId),
    CacheKey.plagiarismTop10(assignmentId)
  );
  await invalidateByPattern("aita:dashboard:stats:*");
}

/** Goi sau khi appeal duoc resolve (diem co the thay doi) */
export async function invalidateAppealCache(submissionId: string): Promise<void> {
  await cacheDel(CacheKey.submissionResult(submissionId));
  await invalidateByPattern("aita:dashboard:stats:*");
}
