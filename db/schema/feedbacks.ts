import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const feedbacks = pgTable('feedbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  rating: integer('rating').notNull().default(5),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const feedbacksRelations = relations(feedbacks, ({ one }) => ({
  user: one(users, { fields: [feedbacks.userId], references: [users.id] }),
}));

export type Feedback = typeof feedbacks.$inferSelect;
export type NewFeedback = typeof feedbacks.$inferInsert;
