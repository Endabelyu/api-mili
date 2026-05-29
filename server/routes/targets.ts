import { OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '../lib/db';
import { targets, accounts } from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';

const app = new OpenAPIHono();
const API_TAGS = ['Targets'];

app.use('*', requireAuth);

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  targetAmount: z.string().or(z.number()).transform(v => String(v)),
  currentAmount: z.string().or(z.number()).optional().default('0').transform(v => String(v)),
  deadline: z.string().optional().nullable(),
  color: z.string().length(7).optional().default('#15803D'),
  icon: z.string().optional().default('🎯'),
  status: z.enum(['active', 'completed', 'paused']).optional().default('active'),
  accountId: z.string().uuid().optional().nullable(),
  pinned: z.boolean().optional().default(false),
});

const updateTargetSchema = createTargetSchema.partial();

const targetResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  targetAmount: z.string(),
  currentAmount: z.string(),
  deadline: z.string().nullable(),
  color: z.string(),
  icon: z.string(),
  status: z.string(),
  pinned: z.boolean().optional(),
  accountId: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
});

// Batch fetch account balances for linked targets
async function batchAccountBalances(userId: string, accountIds: string[]): Promise<Map<string, string>> {
  if (accountIds.length === 0) return new Map();

  const rows = await db
    .select({ id: accounts.id, balance: accounts.balance })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.id, accountIds)));

  return new Map(rows.map(r => [r.id, String(r.balance)]));
}

app.openapi({
  method: 'get',
  path: '/',
  summary: 'List targets',
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(targetResponseSchema) })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };

  const result = await db.query.targets.findMany({
    where: eq(targets.userId, user.id),
    orderBy: (targets, { desc }) => [desc(targets.createdAt)],
    with: { account: true },
  });

  const linkedAccountIds = result.filter(t => t.accountId).map(t => t.accountId!);
  const balanceMap = await batchAccountBalances(user.id, linkedAccountIds);

  const items = result.map(t => ({
    ...t,
    currentAmount: t.accountId ? (balanceMap.get(t.accountId) ?? t.currentAmount) : t.currentAmount,
    accountName: (t as typeof t & { account?: { name: string } | null }).account?.name ?? null,
  }));

  return c.json({ items }, 200);
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Create target',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createTargetSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: targetResponseSchema
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const data = c.req.valid('json');
  const deadlineDate = data.deadline ? new Date(data.deadline) : null;

  // Validate account ownership if accountId provided
  if (data.accountId) {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.id, data.accountId), eq(accounts.userId, user.id)),
    });
    if (!account) throw new HTTPException(403, { message: 'Account not found or not owned by user' });
  }

  const [newTarget] = await db.insert(targets)
    .values({
      ...data,
      userId: user.id,
      deadline: deadlineDate,
      accountId: data.accountId ?? null,
      pinned: data.pinned ?? false,
    })
    .returning();

  if (newTarget.accountId) {
    const balanceMap = await batchAccountBalances(user.id, [newTarget.accountId]);
    return c.json({ ...newTarget, currentAmount: balanceMap.get(newTarget.accountId) ?? newTarget.currentAmount }, 201);
  }

  return c.json(newTarget, 201);
});

app.openapi({
  method: 'put',
  path: '/{id}',
  summary: 'Update target',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: updateTargetSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: targetResponseSchema
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });
  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  // Validate account ownership if accountId provided
  if (data.accountId) {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.id, data.accountId), eq(accounts.userId, user.id)),
    });
    if (!account) throw new HTTPException(403, { message: 'Account not found or not owned by user' });
  }

  const { deadline, accountId, pinned, ...restData } = data;
  const updateData = {
    ...restData,
    updatedAt: new Date(),
    ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
    ...(accountId !== undefined && { accountId: accountId ?? null }),
    ...(pinned !== undefined && { pinned }),
  };

  const [updatedTarget] = await db.update(targets)
    .set(updateData)
    .where(eq(targets.id, id))
    .returning();

  if (updatedTarget.accountId) {
    const balanceMap = await batchAccountBalances(user.id, [updatedTarget.accountId]);
    return c.json({ ...updatedTarget, currentAmount: balanceMap.get(updatedTarget.accountId) ?? updatedTarget.currentAmount }, 200);
  }

  return c.json(updatedTarget, 200);
});

app.openapi({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete target',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    204: {
      description: 'No Content'
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');

  const existing = await db.query.targets.findFirst({
    where: and(eq(targets.id, id), eq(targets.userId, user.id)),
  });
  if (!existing) throw new HTTPException(404, { message: 'Target not found' });

  await db.delete(targets).where(eq(targets.id, id));

  return new Response(null, { status: 204 });
});

export default app;
