import { rateLimiter } from 'hono-rate-limiter';
import Redis from 'ioredis';
import { getConnInfo } from 'hono/bun';

/**
 * Redis-backed rate limiter for Hono.
 * Uses `ioredis` + `hono-rate-limiter` for distributed limiting.
 */

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = process.env.NODE_ENV === 'production' ? new Redis(redisUrl) : null as any;

// Create a custom store for hono-rate-limiter using ioredis
class RedisStore {
  client: Redis;
  windowMs: number;

  constructor(client: Redis, windowMs: number) {
    this.client = client;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const multi = this.client.multi();
    multi.incr(key);
    multi.pttl(key);
    const results = await multi.exec();
    
    if (!results) throw new Error('Redis transaction failed');
    
    const totalHits = results[0][1] as number;
    let ttl = results[1][1] as number;

    // If no TTL is set (-1), set it to the window size
    if (ttl === -1) {
      await this.client.pexpire(key, this.windowMs);
      ttl = this.windowMs;
    }

    const resetTime = new Date(Date.now() + ttl);
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    await this.client.decr(key);
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(key);
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
    ...(isProd ? { store: new RedisStore(redis, windowMs) } : {}),
    message: { error: 'Too many requests, please slow down.' },
    statusCode: 429,
  });
}

/** Strict limiter: 20 writes per minute per IP (for POST/PUT/DELETE routes) */
export const writeLimiter = createRateLimiter(20, 60_000);

/** Lax limiter: 120 reads per minute per IP (for GET routes) */
export const readLimiter = createRateLimiter(120, 60_000);
