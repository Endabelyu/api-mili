import { pgTable, text, varchar, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { categories } from './categories';

export const hiddenCategories = pgTable('hidden_categories', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: varchar('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.userId, table.categoryId] }),
]);

export const hiddenCategoriesRelations = relations(hiddenCategories, ({ one }) => ({
  user: one(users, { fields: [hiddenCategories.userId], references: [users.id] }),
  category: one(categories, { fields: [hiddenCategories.categoryId], references: [categories.id] }),
}));
