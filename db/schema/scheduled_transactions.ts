import { pgTable, uuid, varchar, text, decimal, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { categories } from './categories';
import { accounts } from './accounts';

export const scheduledTransactions = pgTable('scheduled_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 10 }).notNull(), // 'income' | 'expense'
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  categoryId: varchar('category_id').notNull().references(() => categories.id),
  accountId: uuid('account_id').references(() => accounts.id),
  description: text('description'),
  frequency: varchar('frequency', { length: 20 }).notNull(), // 'daily' | 'weekly' | 'monthly' | 'yearly'
  nextRunDate: timestamp('next_run_date', { mode: 'date' }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'paused' | 'completed'
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

export const scheduledTransactionsRelations = relations(scheduledTransactions, ({ one }) => ({
  user: one(users, { fields: [scheduledTransactions.userId], references: [users.id] }),
  category: one(categories, { fields: [scheduledTransactions.categoryId], references: [categories.id] }),
  account: one(accounts, { fields: [scheduledTransactions.accountId], references: [accounts.id] }),
}));

export type ScheduledTransaction = typeof scheduledTransactions.$inferSelect;
export type NewScheduledTransaction = typeof scheduledTransactions.$inferInsert;
