import { pgTable, uuid, varchar, text, decimal, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const targets = pgTable('targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 255 }).notNull(),
  targetAmount: decimal('target_amount', { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 15, scale: 2 }).notNull().default('0'),
  deadline: timestamp('deadline', { mode: 'date' }),
  color: varchar('color', { length: 7 }).notNull().default('#12B76A'),
  icon: varchar('icon', { length: 50 }).notNull().default('🎯'),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'completed' | 'paused'
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
}, (table) => {
  return {
    userIdIdx: index('targets_user_id_idx').on(table.userId),
  };
});

export const targetsRelations = relations(targets, ({ one }) => ({
  user: one(users, { fields: [targets.userId], references: [users.id] }),
}));

export type Target = typeof targets.$inferSelect;
export type NewTarget = typeof targets.$inferInsert;
