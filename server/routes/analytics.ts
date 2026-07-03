import { Hono } from 'hono';
import { db } from '../lib/db';
import { users, activityLogs } from '@db/schema';
import { requireAuth } from '../lib/auth-middleware.server';
import { eq, sql, desc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { Context, Next } from 'hono';

const analytics = new Hono();

// Middleware to ensure only developers can access analytics
const requireDeveloper = async (c: Context, next: Next) => {
  const user = c.get('user') as { role?: string };
  if (user?.role !== 'developer') {
    throw new HTTPException(403, { message: 'Forbidden: Developer access required' });
  }
  await next();
};

analytics.use('*', requireAuth, requireDeveloper);

analytics.get('/summary', async (c) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [{ totalUsers }] = await db.select({ totalUsers: sql<number>`count(*)` }).from(users);
  const [{ newUsersThisMonth }] = await db
    .select({ newUsersThisMonth: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.createdAt} >= ${startOfMonth}`);

  const growth = await db.select({
    month: sql<string>`to_char(${users.createdAt}, 'YYYY-MM')`,
    count: sql<number>`count(*)`
  })
  .from(users)
  .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`)
  .orderBy(desc(sql`to_char(${users.createdAt}, 'YYYY-MM')`))
  .limit(6);

  return c.json({
    totalUsers: Number(totalUsers),
    newUsersThisMonth: Number(newUsersThisMonth),
    growth: growth.reverse()
  });
});

analytics.get('/users', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') || '1'));
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || '100')));
  const offset = (page - 1) * limit;

  const userList = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    banned: users.banned,
    lastSeenAt: users.lastSeenAt,
    createdAt: users.createdAt,
  }).from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  return c.json(userList);
});

analytics.get('/activities', async (c) => {
  const action = c.req.query('action');

  const items = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      description: activityLogs.description,
      metadata: activityLogs.metadata,
      ipAddress: activityLogs.ipAddress,
      createdAt: activityLogs.createdAt,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        banned: users.banned,
      },
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.userId, users.id))
    .where(action ? eq(activityLogs.action, action) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(200);

  return c.json({ items });
});

analytics.put('/users/:id/ban', async (c) => {
  const id = c.req.param('id');
  
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (user.role === 'developer') {
    throw new HTTPException(400, { message: 'Cannot ban a developer' });
  }

  const newBannedState = !user.banned;
  await db.update(users)
    .set({ banned: newBannedState, updatedAt: new Date() })
    .where(eq(users.id, id));

  return c.json({ success: true, banned: newBannedState });
});

analytics.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  
  const [user] = await db.select().from(users).where(eq(users.id, id));
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (user.role === 'developer') {
    throw new HTTPException(400, { message: 'Cannot delete a developer' });
  }

  await db.delete(users).where(eq(users.id, id));

  return c.json({ success: true });
});

export default analytics;
