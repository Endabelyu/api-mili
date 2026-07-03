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

export async function runDueScheduledTransactions(): Promise<void> {
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
    try {
      // Catch-up loop: create one transaction per missed occurrence, capped at 12
      // to avoid flooding months of backlog in one shot.
      let baseDate = new Date(scheduled.nextRunDate);
      let created = 0;
      const MAX_CATCH_UP = 12;

      while (baseDate <= now && created < MAX_CATCH_UP) {
        // Use the actual scheduled date, not today — so "gaji tgl 25" is recorded on the 25th
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

        baseDate = calculateNextRunDate(baseDate, scheduled.frequency);
        created++;
      }

      // Advance nextRunDate to first future occurrence
      await db
        .update(scheduledTransactions)
        .set({ nextRunDate: baseDate, updatedAt: new Date() })
        .where(eq(scheduledTransactions.id, scheduled.id));

      succeeded += created;
    } catch (err) {
      failed++;
      logger.error('Scheduled runner: failed to process transaction', {
        scheduledId: scheduled.id,
        userId: scheduled.userId,
        frequency: scheduled.frequency,
        nextRunDate: scheduled.nextRunDate,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Scheduled runner: done', { succeeded, failed });
}
