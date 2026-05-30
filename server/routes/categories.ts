import { OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '@server/lib/db';
import { categories } from '@db/schema';
import { asc, eq, or, isNull } from 'drizzle-orm';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { createRateLimiter } from '@server/lib/rate-limit';
import { HTTPException } from 'hono/http-exception';

const app = new OpenAPIHono();
const API_TAGS = ['Categories'];
const categoryWriteLimiter = createRateLimiter(10, 60_000); // 10/min per IP

// Auth required for all routes
app.use('*', requireAuth);

// ─── GET / — List categories (system defaults + user's own) ─────────────────
app.openapi({
  method: 'get',
  path: '/',
  summary: 'Get all categories (system + user)',
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
            }))
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const user = c.get('user') as { id: string };

  const items = await db.query.categories.findMany({
    where: or(isNull(categories.userId), eq(categories.userId, user.id)),
    orderBy: [asc(categories.label)],
  });

  return c.json({
    items: items.map(item => ({
      ...item,
      isOwn: item.userId === user.id,
    })),
  }, 200);
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
  await categoryWriteLimiter(c, async () => {});

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

  await db.delete(categories).where(eq(categories.id, id));
  return c.json({ success: true });
});

export default app;
export type CategoriesApp = typeof app;
