import { Hono } from 'hono';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { createRateLimiter } from '@server/lib/rate-limit';
import { db } from '@server/lib/db';
import { transactions, categories } from '@db/schema';
import { eq, desc } from 'drizzle-orm';

const app = new Hono();
const exportLimiter = createRateLimiter(10, 60_000);

app.use('*', requireAuth);
app.use('*', exportLimiter);

/**
 * GET /api/export/transactions
 * Returns all user transactions as a downloadable CSV file.
 * Row cap: 10,000 to prevent unbounded queries on large accounts.
 */
app.get('/transactions', async (c) => {
  const user = c.get('user') as { id: string; name?: string };

  const rows = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      description: transactions.description,
      categoryLabel: categories.label,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.date))
    .limit(10000); // safety cap — prevents unbounded queries

  const csvField = (value: string): string =>
    `"${String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

  // Build CSV
  const header = 'Date,Type,Category,Description,Amount';
  const csvRows = rows.map((row) => {
    const date = row.date ? new Date(row.date).toISOString().split('T')[0] : '';
    const type = row.type ?? '';
    const category = csvField(row.categoryLabel ?? '');
    const description = csvField(row.description ?? '');
    const amount = row.amount ?? '0';
    return `${date},${type},${category},${description},${amount}`;
  });

  const csv = [header, ...csvRows].join('\n');
  const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export default app;
