import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../lib/db';
import { accounts } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { requireAuth } from '@server/lib/auth-middleware.server';

const app = new Hono();

app.use('*', requireAuth);

// Schemas
const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['bank', 'e-wallet', 'cash', 'investment', 'credit-card']),
  balance: z.string().or(z.number()).transform(v => String(v)),
  currency: z.string().min(1).max(10).optional().default('IDR'),
  color: z.string().length(7).optional().default('#15803D'),
  icon: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});

const updateAccountSchema = createAccountSchema.partial();

// ─── List Accounts ──────────────────────────────────────────────────────────
app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const result = await db.query.accounts.findMany({
    where: eq(accounts.userId, user.id),
    orderBy: (accounts, { desc }) => [desc(accounts.isDefault), desc(accounts.createdAt)],
  });

  return c.json({ items: result });
});

// ─── Create Account ─────────────────────────────────────────────────────────
app.post('/', zValidator('json', createAccountSchema), async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');

  // If this is set as default, unset others first (optional luxury, but good UX)
  if (data.isDefault) {
    await db.update(accounts)
      .set({ isDefault: false })
      .where(eq(accounts.userId, user.id));
  }

  const [newAccount] = await db.insert(accounts)
    .values({ ...data, userId: user.id })
    .returning();

  return c.json(newAccount, 201);
});

// ─── Update Account ─────────────────────────────────────────────────────────
app.put('/:id', zValidator('json', updateAccountSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const data = c.req.valid('json');

  // Verify ownership
  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Account not found' });

  if (data.isDefault && !existing.isDefault) {
    await db.update(accounts)
      .set({ isDefault: false })
      .where(eq(accounts.userId, user.id));
  }

  const [updatedAccount] = await db.update(accounts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(accounts.id, id))
    .returning();

  return c.json(updatedAccount);
});

// ─── Delete Account ─────────────────────────────────────────────────────────
app.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.userId, user.id)),
  });

  if (!existing) throw new HTTPException(404, { message: 'Account not found' });

  await db.delete(accounts).where(eq(accounts.id, id));

  return new Response(null, { status: 204 });
});

export default app;
