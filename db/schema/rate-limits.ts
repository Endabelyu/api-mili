import { pgTable, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

export const rateLimits = pgTable('rate_limits', {
  key: varchar('key', { length: 255 }).primaryKey(),
  totalHits: integer('total_hits').notNull().default(1),
  expiresAt: timestamp('expires_at').notNull(),
});