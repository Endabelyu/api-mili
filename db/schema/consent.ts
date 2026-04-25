import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userConsents = pgTable('user_consents', {
  id: uuid('id').primaryKey().defaultRandom(),
  ipHash: text('ip_hash').notNull(),
  consentVersion: text('consent_version').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
