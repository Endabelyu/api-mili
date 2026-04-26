import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../lib/db';
import { scheduledTransactions } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';

const app = new Hono();

app.use('*', requireAuth);

const createScheduledSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.string().or(z.number()).transform(v => String(v)),
  categoryId: z.string().min(1),
  accountId: z.string().uuid().optional().nullable(),
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

export default app;
