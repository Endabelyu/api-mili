import { pgTable, text, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const activityLogs = pgTable('activity_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 100 }).notNull(),
  description: text('description').notNull(),
  metadata: jsonb('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
