import { Hono } from 'hono';
import { db } from '../lib/db';
import { transactions } from '../../db/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { requireAuth } from '../lib/auth-middleware.server';

const app = new Hono();

app.use('*', requireAuth);

app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const monthParam = c.req.query('month'); // format: YYYY-MM
  if (!monthParam) throw new HTTPException(400, { message: 'Month parameter is required (YYYY-MM)' });

  // Calculate start and end dates
  const startDate = new Date(`${monthParam}-01T00:00:00Z`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  // Fetch transactions for the month
  const results = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, user.id),
      gte(transactions.date, startDate),
      lt(transactions.date, endDate)
    ),
    with: {
      category: true,
      account: true,
    },
    orderBy: (transactions, { desc }) => [desc(transactions.date)],
  });

  // Group by date
  const grouped = results.reduce((acc, curr) => {
    // Get YYYY-MM-DD in local time to match frontend expectations
    const d = curr.date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!acc[dateStr]) {
      acc[dateStr] = {
        date: dateStr,
        income: 0,
        expense: 0,
        items: [],
      };
    }
    
    const amount = parseFloat(curr.amount as string);
    if (curr.type === 'income') {
      acc[dateStr].income += amount;
    } else {
      acc[dateStr].expense += amount;
    }
    
    acc[dateStr].items.push(curr);
    return acc;
  }, {} as Record<string, { date: string; income: number; expense: number; items: typeof results }>);

  return c.json({
    month: monthParam,
    days: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
  });
});

export default app;
