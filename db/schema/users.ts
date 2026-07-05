import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { transactions } from './transactions';
import { budgets } from './budgets';
import { feedbacks } from './feedbacks';
import { activityLogs } from './activity-logs';
import { hiddenCategories } from './hidden-categories';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  role: text('role').default('user'),
  banned: boolean('banned').default(false),
  lastSeenAt: timestamp('last_seen_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  transactions: many(transactions),
  budgets: many(budgets),
  feedbacks: many(feedbacks),
  activityLogs: many(activityLogs),
  hiddenCategories: many(hiddenCategories),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
