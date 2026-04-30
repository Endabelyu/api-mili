import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../lib/db';
import { scheduledTransactions } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';
import * as transactionService from '../lib/services/transactions.server';

function calculateNextRunDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

const app = new Hono();

app.use('*', requireAuth);

const createScheduledSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.string().or(z.number()).transform(v => String(v)),
  categoryId: z.string().min(1),
  accountId: z.string().uuid().optional().nullable(),
  toAccountId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  nextRunDate: z.string().min(1),
  status: z.enum(['active', 'paused', 'completed']).optional().default('active'),
});

const updateScheduledSchema = createScheduledSchema.partial();

// ─── List Scheduled Transactions ──────────────────────────────────────────
app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const result = await db.query.scheduledTransactions.findMany({
    where: eq(scheduledTransactions.userId, user.id),
    with: {
      category: true,
      account: true,
      toAccount: true,
    },
    orderBy: (scheduledTransactions, { desc }) => [desc(scheduledTransactions.createdAt)],
  });

  return c.json({ items: result });
});

// ─── Create Scheduled Transaction ──────────────────────────────────────────
app.post('/', zValidator('json', createScheduledSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');
  const nextRun = new Date(data.nextRunDate);

  const [newScheduled] = await db.insert(scheduledTransactions)
    .values({
      ...data,
      userId: user.id,
      nextRunDate: nextRun,
    })
    .returning();

  return c.json(newScheduled, 201);
});

// ─── Update Scheduled Transaction ──────────────────────────────────────────
app.put('/:id', zValidator('json', updateScheduledSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');

  const existing = await db.query.scheduledTransactions.findFirst({
    where: and(eq(scheduledTransactions.id, id), eq(scheduledTransactions.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Scheduled transaction not found' });

  const { nextRunDate, ...restData } = data;
  const updateData = { 
    ...restData, 
    updatedAt: new Date(),
    ...(nextRunDate !== undefined && {
      nextRunDate: new Date(nextRunDate)
    })
  };

  const [updatedScheduled] = await db.update(scheduledTransactions)
    .set(updateData)
    .where(eq(scheduledTransactions.id, id))
    .returning();

  return c.json(updatedScheduled);
});

// ─── Delete Scheduled Transaction ──────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const existing = await db.query.scheduledTransactions.findFirst({
    where: and(eq(scheduledTransactions.id, id), eq(scheduledTransactions.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Scheduled transaction not found' });

  await db.delete(scheduledTransactions).where(eq(scheduledTransactions.id, id));

  return new Response(null, { status: 204 });
});

// ─── Post Scheduled Transaction (Execute) ──────────────────────────────────
app.post('/:id/post', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const scheduled = await db.query.scheduledTransactions.findFirst({
    where: and(eq(scheduledTransactions.id, id), eq(scheduledTransactions.userId, user.id)),
  });

  if (!scheduled) throw new HTTPException(404, { message: 'Scheduled transaction not found' });

  try {
    return await db.transaction(async (tx) => {
      // 1. Create the actual transaction
      await transactionService.createTransaction({
        userId: user.id,
        type: scheduled.type as 'income' | 'expense' | 'transfer',
        amount: String(scheduled.amount),
        categoryId: scheduled.categoryId,
        accountId: scheduled.accountId || undefined,
        toAccountId: scheduled.toAccountId || undefined,
        description: scheduled.description || `Scheduled: ${scheduled.description || 'Auto-generated'}`,
        date: new Date().toISOString().split('T')[0], // Today's date
      });

      // 2. Update next run date
      const nextRun = calculateNextRunDate(new Date(scheduled.nextRunDate), scheduled.frequency);

      const [updated] = await tx.update(scheduledTransactions)
        .set({
          nextRunDate: nextRun,
          updatedAt: new Date(),
        })
        .where(eq(scheduledTransactions.id, id))
        .returning();

      return c.json({ success: true, item: updated });
    });
  } catch (err) {
    const error = err as Error;
    return c.json({ error: error.message }, 400);
  }
});

export default app;
