import { lte, eq, and } from 'drizzle-orm';
import { db } from './db';
import { scheduledTransactions } from '@db/schema';
import { createTransaction } from './services/transactions.server';
import { logger } from './logger';

export function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly': {
      const originalDay = current.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(originalDay, daysInMonth));
      break;
    }
    case 'yearly': {
      const originalDay = current.getDate();
      const originalMonth = current.getMonth();
      next.setFullYear(next.getFullYear() + 1);
      const daysInMonth = new Date(next.getFullYear(), originalMonth + 1, 0).getDate();
      next.setMonth(originalMonth);
      next.setDate(Math.min(originalDay, daysInMonth));
      break;
    }
  }
  return next;
}

let isRunning = false;

export async function runDueScheduledTransactions(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const now = new Date();

    const due = await db.query.scheduledTransactions.findMany({
      where: and(
        eq(scheduledTransactions.status, 'active'),
        lte(scheduledTransactions.nextRunDate, now)
      ),
    });

    if (due.length === 0) return;

    logger.info('Scheduled runner: processing due transactions', { count: due.length });

    let succeeded = 0;
    let failed = 0;

    for (const scheduled of due) {
      let baseDate = new Date(scheduled.nextRunDate);
      let created = 0;
      const MAX_CATCH_UP = 12;

      while (baseDate <= now && created < MAX_CATCH_UP) {
        try {
          // Use the actual scheduled date so "gaji tgl 25" records on the 25th
          await createTransaction({
            userId: scheduled.userId,
            type: scheduled.type as 'income' | 'expense' | 'transfer',
            amount: String(scheduled.amount),
            categoryId: scheduled.categoryId,
            accountId: scheduled.accountId ?? undefined,
            toAccountId: scheduled.toAccountId ?? undefined,
            description: scheduled.description ?? undefined,
            date: baseDate.toISOString().split('T')[0],
          });

          const nextDate = calculateNextRunDate(baseDate, scheduled.frequency);

          // Persist progress after each occurrence — prevents re-duplicating
          // already-created transactions if a later occurrence throws
          await db
            .update(scheduledTransactions)
            .set({ nextRunDate: nextDate, updatedAt: new Date() })
            .where(eq(scheduledTransactions.id, scheduled.id));

          baseDate = nextDate;
          created++;
          succeeded++;
        } catch (err) {
          failed++;
          logger.error('Scheduled runner: failed to process transaction', {
            scheduledId: scheduled.id,
            userId: scheduled.userId,
            frequency: scheduled.frequency,
            occurrenceDate: baseDate.toISOString(),
            error: err instanceof Error ? err.message : String(err),
          });
          break; // stop catch-up for this item; nextRunDate already points to the failed date
        }
      }

      if (created === MAX_CATCH_UP && baseDate <= now) {
        logger.warn('Scheduled runner: hit catch-up cap, will resume next run', {
          scheduledId: scheduled.id,
          remaining: baseDate.toISOString(),
        });
      }
    }

    logger.info('Scheduled runner: done', { succeeded, failed });
  } finally {
    isRunning = false;
  }
}
