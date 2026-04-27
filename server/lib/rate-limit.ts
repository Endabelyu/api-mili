import { rateLimiter } from 'hono-rate-limiter';
import { db } from './db';
import { rateLimits } from '@db/schema/rate-limits';
import { sql, eq } from 'drizzle-orm';

/**
 * PostgreSQL-backed rate limiter for Hono.
 * Uses `drizzle-orm` + `hono-rate-limiter` for distributed limiting.
 */

// Create a custom store for hono-rate-limiter using Postgres
class PostgresStore {
  windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.windowMs);

    const result = await db
      .insert(rateLimits)
      .values({
        key,
        totalHits: 1,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          totalHits: sql`CASE 
            WHEN ${rateLimits.expiresAt} < ${now.toISOString()}::timestamp THEN 1 
            ELSE ${rateLimits.totalHits} + 1 
          END`,
          expiresAt: sql`CASE 
            WHEN ${rateLimits.expiresAt} < ${now.toISOString()}::timestamp THEN ${expiresAt.toISOString()}::timestamp 
            ELSE ${rateLimits.expiresAt} 
          END`,
        },
      })
      .returning({
        totalHits: rateLimits.totalHits,
        expiresAt: rateLimits.expiresAt,
      });

    const row = result[0];
    
    return { 
      totalHits: Number(row.totalHits), 
      resetTime: new Date(row.expiresAt) 
    };
  }

  async decrement(key: string): Promise<void> {
    await db.execute(sql`
      UPDATE rate_limits SET total_hits = total_hits - 1
      WHERE key = ${key} AND total_hits > 0
    `);
  }

  async resetKey(key: string): Promise<void> {
    await db.delete(rateLimits).where(eq(rateLimits.key, key));
  }
}

/**
 * Helper to create rate limiters
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: 'draft-6', 
    keyGenerator: (c) => {
      return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
             c.req.header('x-real-ip') || 
             'unknown-ip';
    },
    ...(isProd ? { store: new PostgresStore(windowMs) } : {}),
    message: { error: 'Too many requests, please slow down.' },
    statusCode: 429,
  });
}

/** Strict limiter: 20 writes per minute per IP (for POST/PUT/DELETE routes) */
export const writeLimiter = createRateLimiter(20, 60_000);

/** Lax limiter: 120 reads per minute per IP (for GET routes) */
export const readLimiter = createRateLimiter(120, 60_000);
