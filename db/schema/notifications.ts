import { pgTable, uuid, text, boolean, timestamp, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  amount: text('amount'),
  time: varchar('time', { length: 50 }), // fallback for relative text
  icon: varchar('icon', { length: 30 }).default('Zap'),
  color: varchar('color', { length: 30 }).default('bg-orange-50'),
  iconColor: varchar('iconColor', { length: 30 }).default('text-orange-500'),
  unread: boolean('unread').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
});

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
