import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../lib/db';
import { targets } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';

const app = new Hono();

app.use('*', requireAuth);

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.string().or(z.number()).transform(v => String(v)),
  currentAmount: z.string().or(z.number()).optional().default('0').transform(v => String(v)),
  deadline: z.string().optional().nullable(),
  color: z.string().length(7).optional().default('#15803D'),
  icon: z.string().optional().default('🎯'),
  status: z.enum(['active', 'completed', 'paused']).optional().default('active'),
});

const updateTargetSchema = createTargetSchema.partial();

// ─── List Targets ───────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const result = await db.query.targets.findMany({
    where: eq(targets.userId, user.id),
    orderBy: (targets, { desc }) => [desc(targets.createdAt)],
  });

  return c.json({ items: result });
});

// ─── Create Target ──────────────────────────────────────────────────────────
app.post('/', zValidator('json', createTargetSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');
  const deadlineDate = data.deadline ? new Date(data.deadline) : null;

  const [newTarget] = await db.insert(targets)
    .values({
      ...data,
      userId: user.id,
      deadline: deadlineDate,
    })
    .returning();

  return c.json(newTarget, 201);
});

// ─── Update Target ──────────────────────────────────────────────────────────
app.put('/:id', zValidator('json', updateTargetSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  const { deadline, ...restData } = data;
  const updateData = { 
    ...restData, 
    updatedAt: new Date(),
    ...(deadline !== undefined && {
      deadline: deadline ? new Date(deadline) : null
    })
  };

  const [updatedTarget] = await db.update(targets)
    .set(updateData)
    .where(eq(targets.id, id))
    .returning();

  return c.json(updatedTarget);
});

// ─── Delete Target ──────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  await db.delete(targets).where(eq(targets.id, id));

  return new Response(null, { status: 204 });
});

export default app;
