import { OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '@server/lib/db';
import { categories, hiddenCategories } from '@db/schema';
import { asc, eq, or, isNull, and } from 'drizzle-orm';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { createRateLimiter } from '@server/lib/rate-limit';
import { HTTPException } from 'hono/http-exception';

const app = new OpenAPIHono();
const API_TAGS = ['Categories'];
const categoryWriteLimiter = createRateLimiter(10, 60_000); // 10/min per IP

// Auth required for all routes
app.use('*', requireAuth);
// Rate limit write operations (POST/PUT/DELETE) — registered as middleware, not inline call
app.use('*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
  return categoryWriteLimiter(c, next);
});

// ─── GET / — List categories (system defaults + user's own) ─────────────────
const listQuerySchema = z.object({
  includeHidden: z.string().optional().transform(v => v === 'true'),
});

app.openapi({
  method: 'get',
  path: '/',
  summary: 'Get all categories (system + user)',
  request: {
    query: listQuerySchema,
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(z.object({
              id: z.string(),
              label: z.string(),
              color: z.string(),
              icon: z.string().nullable(),
              type: z.string(),
              isOwn: z.boolean(),
              hidden: z.boolean().optional(),
            }))
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { includeHidden } = c.req.valid('query');

  const [hiddenRows, allItems] = await Promise.all([
    db.query.hiddenCategories.findMany({
      where: eq(hiddenCategories.userId, user.id),
    }),
    db.query.categories.findMany({
      where: or(isNull(categories.userId), eq(categories.userId, user.id)),
      orderBy: [asc(categories.label)],
    }),
  ]);

  const hiddenIds = new Set(hiddenRows.map(h => h.categoryId));

  const items = includeHidden
    ? allItems.map(item => ({ ...item, isOwn: item.userId === user.id, hidden: hiddenIds.has(item.id) }))
    : allItems
        .filter(item => !hiddenIds.has(item.id))
        .map(item => ({ ...item, isOwn: item.userId === user.id }));

  return c.json({ items }, 200);
});

// ─── POST / — Create user category ─────────────────────────────────────────
const createCategorySchema = z.object({
  label: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().max(10).optional(),
  type: z.enum(['income', 'expense', 'both']),
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Create a user category',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createCategorySchema
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
            label: z.string(),
            color: z.string(),
            icon: z.string().nullable(),
            type: z.string(),
          })
        }
      }
    },
    400: { description: 'Validation Error' }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { label, color, icon, type } = c.req.valid('json');

  const { randomUUID } = await import('crypto');
  const id = `${label.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)}-${randomUUID().slice(0, 8)}`;

  const [newItem] = await db.insert(categories).values({
    id,
    label,
    color,
    icon: icon || '📦',
    type,
    userId: user.id,
  }).returning();

  return c.json(newItem, 201);
});

// ─── PATCH /:id/visibility — Hide or unhide a category ──────────────────────
const visibilitySchema = z.object({
  hidden: z.boolean(),
});

app.openapi({
  method: 'patch',
  path: '/{id}/visibility',
  summary: 'Hide or unhide a category',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: visibilitySchema
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Visibility updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            hidden: z.boolean(),
          })
        }
      }
    },
    404: { description: 'Category not found' },
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');
  const { hidden } = c.req.valid('json');

  // Verify category exists and is accessible to this user
  const category = await db.query.categories.findFirst({
    where: and(eq(categories.id, id), or(isNull(categories.userId), eq(categories.userId, user.id))),
  });

  if (!category) {
    throw new HTTPException(404, { message: 'Category not found' });
  }

  if (hidden) {
    await db.insert(hiddenCategories)
      .values({ userId: user.id, categoryId: id })
      .onConflictDoNothing();
  } else {
    await db.delete(hiddenCategories)
      .where(and(eq(hiddenCategories.userId, user.id), eq(hiddenCategories.categoryId, id)));
  }

  return c.json({ success: true, hidden }, 200);
});

// ─── DELETE /:id — Delete own category only ─────────────────────────────────
app.openapi({
  method: 'delete',
  path: '/{id}',
  summary: 'Delete a user category',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { description: 'Deleted' },
    403: { description: 'Cannot delete system category' },
    404: { description: 'Not found' },
    409: { description: 'Category has existing transactions' },
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };
  const { id } = c.req.valid('param');

  const existing = await db.query.categories.findFirst({
    where: eq(categories.id, id),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Category not found' });
  }

  if (!existing.userId) {
    throw new HTTPException(403, { message: 'Cannot delete system category' });
  }

  if (existing.userId !== user.id) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  try {
    await db.delete(categories).where(eq(categories.id, id));
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      throw new HTTPException(409, { message: 'Category has existing transactions. Hide it instead of deleting.' });
    }
    throw err;
  }

  return c.json({ success: true });
});

export default app;
export type CategoriesApp = typeof app;
