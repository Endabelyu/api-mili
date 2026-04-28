import { OpenAPIHono, z } from '@hono/zod-openapi';
import { eq, and, like, desc, sql, SQL } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { transactions, categories } from '@db/schema';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { writeLimiter, readLimiter } from '@server/lib/rate-limit';

const app = new OpenAPIHono();
const API_TAGS = ['Transactions'];

// Apply auth middleware to all routes
app.use('*', requireAuth);
// Rate limiting
app.use('GET /*', readLimiter);
app.use('POST /*', writeLimiter);
app.use('PUT /*', writeLimiter);
app.use('DELETE /*', writeLimiter);

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: z.enum(['income', 'expense']).optional(),
  category: z.string().optional(),
  search: z.string().max(100).trim().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
});

app.openapi({
  method: 'get',
  path: '/',
  summary: 'Get all transactions',
  description: 'Retrieves transactional metadata securely.',
  request: {
    query: listQuerySchema
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(z.object({
              id: z.string(),
              amount: z.string(),
              type: z.string(),
              categoryId: z.string(),
              accountId: z.string().nullable(),
              description: z.string().nullable(),
              date: z.any(),
              category: z.object({
                id: z.string(),
                label: z.string(),
                color: z.string(),
                icon: z.string().nullable()
              }).nullable()
            })),
            pagination: z.object({
              page: z.number(),
              limit: z.number(),
              total: z.number(),
              totalPages: z.number()
            })
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const query = c.req.valid('query');
  const page = Number(query.page || '1');
  const limit = Number(query.limit || '20');
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions: (SQL | undefined)[] = [eq(transactions.userId, user.id)];

  if (query.month) {
    const startDate = `${query.month}-01`;
    const [yr, mo] = query.month.split('-');
    const endDate = new Date(Number(yr), Number(mo), 1).toISOString().slice(0, 10); // exclusive
    conditions.push(
      sql`${transactions.date} >= ${startDate}::date AND ${transactions.date} < ${endDate}::date`
    );
  }

  if (query.type) {
    conditions.push(eq(transactions.type, query.type));
  }

  if (query.category) {
    conditions.push(eq(transactions.categoryId, query.category));
  }

  if (query.search) {
    // Escape SQL LIKE wildcards to prevent injection
    const escaped = query.search.replace(/[%_\\]/g, '\\$&');
    conditions.push(
      like(transactions.description, `%${escaped}%`)
    );
  }

  // Execute query
  const items = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit,
    offset,
    with: {
      category: true,
    },
  });

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  return c.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Create transaction schema
const createSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.union([z.string(), z.number()]).transform((v) => {
    const num = typeof v === 'string' ? parseFloat(v) : v;
    return num.toFixed(2);
  }),
  categoryId: z.string(),
  accountId: z.string().optional(),
  description: z.string().optional(),
  date: z.string().date(),
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Create a new transaction',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            amount: z.string(),
            type: z.string(),
            categoryId: z.string(),
            accountId: z.string().nullable(),
            description: z.string().nullable(),
            date: z.any()
          })
        }
      }
    },
    400: {
      description: 'Validation Error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string()
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const data = c.req.valid('json');

  // Verify category exists
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, data.categoryId),
  });

  if (!category) {
    return c.json({ error: 'Category not found' }, 400);
  }

  // Create transaction
  const result = await db
    .insert(transactions)
    .values({
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      accountId: data.accountId,
      description: data.description,
      date: new Date(data.date),
      userId: user.id,
    })
    .returning();

  return c.json(result[0], 201);
});

// PUT /api/transactions/:id - Update transaction (owner check)
// Update transaction schema
const updateSchema = z.object({
  type: z.enum(['income', 'expense']).optional(),
  amount: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === undefined) return undefined;
    const num = typeof v === 'string' ? parseFloat(v) : v;
    return num.toFixed(2);
  }),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  description: z.string().optional(),
  date: z.string().date().optional(),
});

app.openapi({
  method: 'put',
  path: '/{id}',
  summary: 'Update a transaction',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: updateSchema
        }
      }
    }
  },
  responses: {
    200: { description: 'Success' },
    404: { description: 'Not Found' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');

  // Check ownership
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  if (existing.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Verify new category if provided
  if (data.categoryId) {
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, data.categoryId),
    });

    if (!category) {
      return c.json({ error: 'Category not found' }, 400);
    }
  }

  // Update transaction - build update object explicitly to ensure date is converted
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.type) updateData.type = data.type;
  if (data.amount) updateData.amount = data.amount;
  if (data.categoryId) updateData.categoryId = data.categoryId;
  if (data.accountId !== undefined) updateData.accountId = data.accountId;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.date) updateData.date = new Date(data.date);

  const result = await db
    .update(transactions)
    .set(updateData)
    .where(eq(transactions.id, id))
    .returning();

  return c.json(result[0]);
});

app.openapi({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete a transaction',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: { description: 'Success' },
    404: { description: 'Not Found' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');

  // Check ownership
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Transaction not found' }, 404);
  }

  if (existing.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Delete transaction
  await db.delete(transactions).where(eq(transactions.id, id));

  return c.json({ success: true });
});

export default app;
export type TransactionsApp = typeof app;
