import { pgTable, uuid, varchar, decimal, timestamp, text, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { categories } from './categories';
import { accounts } from './accounts';

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  type: varchar('type', { length: 10 }).notNull(), // 'income' | 'expense'
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  toAccountId: uuid('to_account_id').references(() => accounts.id), // For transfers
  categoryId: varchar('category_id').notNull().references(() => categories.id),
  description: text('description'),
  date: timestamp('date', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
}, (table) => [
  index('idx_transactions_user_date').on(table.userId, table.date),
  index('idx_transactions_user_type').on(table.userId, table.type),
  index('idx_transactions_category').on(table.userId, table.categoryId),
]);

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id], relationName: 'fromAccount' }),
  toAccount: one(accounts, { fields: [transactions.toAccountId], references: [accounts.id], relationName: 'toAccount' }),
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
