import { OpenAPIHono, z } from '@hono/zod-openapi';
import { eq, and, sql, sum } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { budgets, transactions, categories } from '@db/schema';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { logActivity } from '@server/lib/activity-logger';
import { writeLimiter, readLimiter } from '@server/lib/rate-limit';

const app = new OpenAPIHono();
const API_TAGS = ['Budgets'];

// Apply auth middleware to all routes
app.use('*', requireAuth);
// Rate limiting
app.use('GET /*', readLimiter);
app.use('POST /*', writeLimiter);
app.use('PUT /*', writeLimiter);
app.use('DELETE /*', writeLimiter);

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

app.openapi({
  method: 'get',
  path: '/',
  summary: 'List budgets for the month',
  description: 'Calculates active budgets dynamically.',
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
              categoryId: z.string(),
              limitAmount: z.string(),
              month: z.string(),
              spent: z.string(),
              remaining: z.string(),
              percentageUsed: z.number(),
              recurring: z.boolean(),
              category: z.object({
                id: z.string(),
                label: z.string(),
                color: z.string(),
                icon: z.string().nullable()
              }).nullable()
            })),
            month: z.string()
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { month: validMonth } = c.req.valid('query');
  const month = validMonth || new Date().toISOString().slice(0, 7); // Default to current YYYY-MM

  // Get budgets for the user and month
  let userBudgets = await db.query.budgets.findMany({
    where: and(eq(budgets.userId, user.id), eq(budgets.month, month)),
    with: {
      category: true,
    },
  });

  // Auto-clone recurring budgets from previous month if current month is empty
  if (userBudgets.length === 0) {
    const [y, m] = month.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1); // month-1 (0-indexed) then -1 more for previous
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevBudgets = await db.query.budgets.findMany({
      where: and(
        eq(budgets.userId, user.id),
        eq(budgets.month, prevMonth),
        eq(budgets.recurring, true)
      ),
    });

    if (prevBudgets.length > 0) {
      const cloned = await db.insert(budgets).values(
        prevBudgets.map(b => ({
          userId: user.id,
          categoryId: b.categoryId,
          limitAmount: b.limitAmount,
          month,
          recurring: true,
        }))
      ).returning();

      // Re-fetch with category relations
      userBudgets = await db.query.budgets.findMany({
        where: and(eq(budgets.userId, user.id), eq(budgets.month, month)),
        with: { category: true },
      });
    }
  }

  // Build correct month boundaries
  const startDate = `${month}-01`;
  // Use next month's first day as exclusive upper bound (handles variable month lengths)
  const [year, monthNum] = month.split('-');
  const nextMonthDate = new Date(Number(year), Number(monthNum), 1); // month is 1-based here = correct next month
  const endDate = nextMonthDate.toISOString().slice(0, 10); // YYYY-MM-DD

  // Single aggregate query: sum expenses per category for the month (avoids N+1)
  const spendingByCategory = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`COALESCE(sum(${transactions.amount}), '0')`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.type, 'expense'),
        sql`${transactions.date} >= ${startDate}::timestamp AND ${transactions.date} < ${endDate}::timestamp`
      )
    )
    .groupBy(transactions.categoryId);

  const spendingMap = new Map(
    spendingByCategory.map((s) => [s.categoryId, s.total])
  );

  const budgetsWithSpending = userBudgets.map((budget) => {
    const spent = parseFloat(spendingMap.get(budget.categoryId) ?? '0');
    const limitAmount = parseFloat(budget.limitAmount);
    return {
      ...budget,
      spent: spent.toFixed(2),
      remaining: (limitAmount - spent).toFixed(2),
      percentageUsed: limitAmount > 0 ? Math.round((spent / limitAmount) * 100) : 0,
    };
  });

  return c.json({
    items: budgetsWithSpending,
    month,
  });
});

const upsertSchema = z.object({
  categoryId: z.string(),
  limitAmount: z.union([z.string(), z.number()]).transform((v) => {
    const num = typeof v === 'string' ? parseFloat(v) : v;
    return num.toFixed(2);
  }),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  recurring: z.boolean().optional().default(true),
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Upsert budget limits',
  request: {
    body: {
      content: {
        'application/json': {
          schema: upsertSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            userId: z.string(),
            categoryId: z.string(),
            limitAmount: z.string(),
            month: z.string(),
            updated: z.boolean()
          })
        }
      }
    },
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            userId: z.string(),
            categoryId: z.string(),
            limitAmount: z.string(),
            month: z.string(),
            updated: z.boolean()
          })
        }
      }
    },
    400: {
      description: 'Validation failure',
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

  // Check if budget already exists for this category + month
  const existing = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.userId, user.id),
      eq(budgets.categoryId, data.categoryId),
      eq(budgets.month, data.month)
    ),
  });

  if (existing) {
    // Update existing budget
    const result = await db
      .update(budgets)
      .set({
        limitAmount: data.limitAmount,
      })
      .where(eq(budgets.id, existing.id))
      .returning();

    return c.json({
      ...result[0],
      updated: true,
    }, 200);
  }

  // Create new budget
  const result = await db
    .insert(budgets)
    .values({
      userId: user.id,
      categoryId: data.categoryId,
      limitAmount: data.limitAmount,
      month: data.month,
      recurring: data.recurring,
    })
    .returning();

  logActivity(
    user.id, 
    'UPSERT_BUDGET', 
    `Set budget limit for category ${data.categoryId} to ${data.limitAmount} for month ${data.month}`, 
    { budgetId: result[0]?.id, categoryId: data.categoryId },
    c.req.header('x-forwarded-for')
  );

  return c.json({
    ...result[0],
    updated: false,
  }, 201);
});

const updateSchema = z.object({
  limitAmount: z.union([z.string(), z.number()]).transform((v) => {
    const num = typeof v === 'string' ? parseFloat(v) : v;
    return num.toFixed(2);
  }).optional(),
  recurring: z.boolean().optional(),
});

app.openapi({
  method: 'put',
  path: '/{id}',
  summary: 'Update budget limits',
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
  const { limitAmount, recurring } = c.req.valid('json');

  // Check ownership
  const existing = await db.query.budgets.findFirst({
    where: eq(budgets.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Budget not found' }, 404);
  }

  if (existing.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Update budget
  const updateData: Record<string, unknown> = {};
  if (limitAmount !== undefined) updateData.limitAmount = limitAmount;
  if (recurring !== undefined) updateData.recurring = recurring;

  const result = await db
    .update(budgets)
    .set(updateData)
    .where(eq(budgets.id, id))
    .returning();

  logActivity(
    user.id, 
    'UPDATE_BUDGET', 
    `Updated budget limit to ${limitAmount}`, 
    { budgetId: id },
    c.req.header('x-forwarded-for')
  );

  return c.json(result[0]);
});

app.openapi({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete budget limits',
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
  const existing = await db.query.budgets.findFirst({
    where: eq(budgets.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Budget not found' }, 404);
  }

  if (existing.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Delete budget
  await db.delete(budgets).where(eq(budgets.id, id));

  logActivity(
    user.id, 
    'DELETE_BUDGET', 
    `Deleted budget limit`, 
    { budgetId: id },
    c.req.header('x-forwarded-for')
  );

  return c.json({ success: true });
});

export default app;
export type BudgetsApp = typeof app;
