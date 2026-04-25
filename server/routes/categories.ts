import { Hono } from 'hono';
import { db } from '@server/lib/db';
import { categories } from '@db/schema';
import { asc } from 'drizzle-orm';

const app = new Hono();

// GET /api/categories - List all categories (public, no auth required)
app.get('/', async (c) => {
  const items = await db.query.categories.findMany({
    orderBy: [asc(categories.label)],
  });

  return c.json({ items });
});

// POST /api/categories - Create a new category
app.post('/', async (c) => {
  const body = await c.req.json();
  const { label, color, icon, type } = body;
  
  if (!label || !color || !type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const id = label.toLowerCase().replace(/\s+/g, '-');
  
  const newItem = await db.insert(categories).values({
    id,
    label,
    color,
    icon: icon || '📦',
    type,
  }).returning();

  return c.json(newItem[0]);
});

export default app;
export type CategoriesApp = typeof app;
