import { OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { writeLimiter, readLimiter } from '@server/lib/rate-limit';
import * as transactionService from '@server/lib/services/transactions.server';
import { logActivity } from '@server/lib/activity-logger';
import { HTTPException } from 'hono/http-exception';

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
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  category: z.string().optional(),
  account: z.string().optional(),
  search: z.string().max(100).trim().optional(),
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20').transform(Number).refine(n => n >= 1 && n <= 200, 'Limit must be 1–200').transform(String),
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
            items: z.array(z.any()),
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
  
  const result = await transactionService.listTransactions({
    userId: user.id,
    month: query.month,
    type: query.type as 'income' | 'expense' | 'transfer',
    category: query.category,
    account: query.account,
    search: query.search,
    page: Number(query.page),
    limit: Number(query.limit),
  });

  return c.json(result);
});

app.openapi({
  method: 'get',
  path: '/{id}',
  summary: 'Get transaction by id',
  request: {
    params: z.object({ id: z.string() })
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.any()
        }
      }
    },
    404: { description: 'Not Found' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  
  const result = await transactionService.getTransactionById(id, user.id);
  if (!result) {
    throw new HTTPException(404, { message: 'Transaction not found' });
  }

  return c.json(result);
});

// Create transaction schema
const createSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.union([z.string(), z.number()])
    .transform((v) => (typeof v === 'string' ? parseFloat(v) : v))
    .refine((n) => n > 0 && isFinite(n), 'Amount must be a positive number')
    .transform((n) => n.toFixed(2)),
  categoryId: z.string(),
  accountId: z.string().optional(),
  toAccountId: z.string().optional(),
  description: z.string().nullable().optional(),
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
          schema: z.any()
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

  try {
    const result = await transactionService.createTransaction({
      ...data,
      userId: user.id,
    });
    
    logActivity(
      user.id, 
      'CREATE_TRANSACTION', 
      `Created ${data.type} transaction for ${data.amount}`, 
      { categoryId: data.categoryId },
      c.req.header('x-forwarded-for')
    );
    
    return c.json(result, 201);
  } catch (err) {
    const error = err as Error;
    return c.json({ error: error.message }, 400);
  }
});

// PUT /api/transactions/:id - Update transaction (owner check)
const updateSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  amount: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === undefined) return undefined;
    const num = typeof v === 'string' ? parseFloat(v) : v;
    return num.toFixed(2);
  }),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  toAccountId: z.string().optional(),
  description: z.string().nullable().optional(),
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
    403: { description: 'Forbidden' },
    404: { description: 'Not Found' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  const data = c.req.valid('json');

  try {
    const result = await transactionService.updateTransaction(id, user.id, data);
    
    logActivity(
      user.id, 
      'UPDATE_TRANSACTION', 
      `Updated transaction ${id}`, 
      { transactionId: id, updates: data },
      c.req.header('x-forwarded-for')
    );
    
    return c.json(result);
  } catch (err) {
    const error = err as { status?: number; message: string };
    if (error.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json({ error: error.message }, error.status as any);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
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
    403: { description: 'Forbidden' },
    404: { description: 'Not Found' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');

  try {
    const result = await transactionService.deleteTransaction(id, user.id);
    
    logActivity(
      user.id, 
      'DELETE_TRANSACTION', 
      `Deleted transaction ${id}`, 
      { transactionId: id },
      c.req.header('x-forwarded-for')
    );
    
    return c.json(result);
  } catch (err) {
    const error = err as { status?: number; message: string };
    if (error.status) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json({ error: error.message }, error.status as any);
    }
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export default app;
export type TransactionsApp = typeof app;
