import { OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '@server/lib/db';
import { categories } from '@db/schema';
import { asc } from 'drizzle-orm';
import { requireAuth } from '@server/lib/auth-middleware.server';

const app = new OpenAPIHono();
const API_TAGS = ['Categories'];

app.openapi({
  method: 'get',
  path: '/',
  summary: 'Get all categories',
  description: 'Retrieves active data models.',
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
              type: z.string()
            }))
          })
        }
      }
    }
  },
  tags: API_TAGS
}, async (c) => {
  const items = await db.query.categories.findMany({
    orderBy: [asc(categories.label)],
  });

  return c.json({ items }, 200);
});

const createCategorySchema = z.object({
  label: z.string(),
  color: z.string(),
  icon: z.string().optional(),
  type: z.enum(['income', 'expense', 'both'])
});

app.use('/', async (c, next) => {
  if (c.req.method !== 'GET') return requireAuth(c, next);
  return next();
});

app.openapi({
  method: 'post',
  path: '/',
  summary: 'Create a new category',
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
            type: z.string()
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
  const { label, color, icon, type } = c.req.valid('json');

  const id = label.toLowerCase().replace(/\s+/g, '-');

  const newItem = await db.insert(categories).values({
    id,
    label,
    color,
    icon: icon || '📦',
    type,
  }).returning();

  return c.json(newItem[0], 201);
});

export default app;
export type CategoriesApp = typeof app;
