import { Hono } from 'hono';
import { db } from '../lib/db';
import { users } from '@db/schema';
import { requireAuth } from '../lib/auth';
import { eq, sql, desc } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

const analytics = new Hono();

// Middleware to ensure only developers can access analytics
const requireDeveloper = async (c: any, next: any) => {
  const user = c.get('user');
  if (user?.role !== 'developer') {
    throw new HTTPException(403, { message: 'Forbidden: Developer access required' });
  }
  await next();
};

analytics.use('*', requireAuth, requireDeveloper);

analytics.get('/summary', async (c) => {
  const allUsers = await db.select().from(users);
  
  const totalUsers = allUsers.length;
  
  // New users this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newUsersThisMonth = allUsers.filter(u => u.createdAt && u.createdAt >= startOfMonth).length;
  
  // Growth per month (last 6 months)
  // Note: pg to_char is specific to Postgres
  const growth = await db.select({
    month: sql<string>`to_char(${users.createdAt}, 'YYYY-MM')`,
    count: sql<number>`count(*)`
  })
  .from(users)
  .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM')`)
  .orderBy(desc(sql`to_char(${users.createdAt}, 'YYYY-MM')`))
  .limit(6);

  return c.json({
    totalUsers,
    newUsersThisMonth,
    growth: growth.reverse()
  });
});

analytics.get('/users', async (c) => {
  const userList = await db.select().from(users).orderBy(desc(users.createdAt));
  
  return c.json(userList);
});

export default analytics;
