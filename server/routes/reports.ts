/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../types/hono.d.ts" />
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, gte, sql, desc, SQL } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { transactions, categories } from '@db/schema';
import { requireAuth } from '@server/lib/auth-middleware.server';
import { readLimiter } from '@server/lib/rate-limit';

const app = new Hono();

// Query schemas
const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

const monthsQuerySchema = z.object({
  months: z.string().transform(Number).default('6'),
});

// Apply auth + rate limiting to all routes
app.use('*', requireAuth);
app.use('*', readLimiter);

// GET /api/reports/summary?month=YYYY-MM - Financial summary
app.get('/summary', zValidator('query', monthQuerySchema), async (c) => {
  const user = c.get('user') as { id: string };
  const { month } = c.req.valid('query');

  // Build date conditions
  let dateCondition: SQL | undefined;
  if (month) {
    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-');
    const nextMonthDate = new Date(Number(year), Number(monthNum), 1);
    const endDate = nextMonthDate.toISOString().slice(0, 10);
    dateCondition = sql`${transactions.date} >= ${startDate}::date AND ${transactions.date} < ${endDate}::date`;
  }

  const baseCondition = eq(transactions.userId, user.id);

  // Get income total
  const incomeResult = await db
    .select({
      total: sql<string | null>`sum(${transactions.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        baseCondition,
        eq(transactions.type, 'income'),
        dateCondition
      )
    );

  // Get expense total
  const expenseResult = await db
    .select({
      total: sql<string | null>`sum(${transactions.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        baseCondition,
        eq(transactions.type, 'expense'),
        dateCondition
      )
    );

  const income = parseFloat(incomeResult[0]?.total ?? '0');
  const expenseCount = expenseResult[0]?.count ?? 0;
  const incomeCount = incomeResult[0]?.count ?? 0;
  const expenses = parseFloat(expenseResult[0]?.total ?? '0');
  const balance = income - expenses;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

  return c.json({
    income,
    expenses,
    balance,
    savingsRate: parseFloat(savingsRate.toFixed(2)),
    transactionCount: incomeCount + expenseCount,
  });
});

// GET /api/reports/by-category?month=YYYY-MM - Category breakdown
app.get('/by-category', zValidator('query', monthQuerySchema), async (c) => {
  const user = c.get('user') as { id: string };
  const { month } = c.req.valid('query');

  // Build date conditions
  let dateCondition: SQL | undefined;
  if (month) {
    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-');
    const nextMonthDate = new Date(Number(year), Number(monthNum), 1);
    const endDate = nextMonthDate.toISOString().slice(0, 10);
    dateCondition = sql`${transactions.date} >= ${startDate}::date AND ${transactions.date} < ${endDate}::date`;
  }

  const baseCondition = eq(transactions.userId, user.id);

  // Get expenses by category
  const categoryData = await db
    .select({
      categoryId: transactions.categoryId,
      label: categories.label,
      color: categories.color,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        baseCondition,
        eq(transactions.type, 'expense'),
        dateCondition
      )
    )
    .groupBy(transactions.categoryId, categories.label, categories.color)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  // Calculate total for percentages
  const totalExpenses = categoryData.reduce(
    (sum, cat) => sum + parseFloat(cat.amount),
    0
  );

  // Add percentage to each category
  const result = categoryData.map((cat) => ({
    categoryId: cat.categoryId,
    label: cat.label,
    color: cat.color,
    amount: parseFloat(cat.amount),
    percentage: totalExpenses > 0
      ? parseFloat(((parseFloat(cat.amount) / totalExpenses) * 100).toFixed(2))
      : 0,
  }));

  return c.json({ items: result });
});

// GET /api/reports/monthly?months=6 - Monthly trend
app.get('/monthly', zValidator('query', monthsQuerySchema), async (c) => {
  const user = c.get('user') as { id: string };
  const { months } = c.req.valid('query');

  // Generate last N months
  const monthsList: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const baseCondition = eq(transactions.userId, user.id);

  // Get all transactions grouped by month and type
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      type: transactions.type,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        baseCondition,
        gte(transactions.date, new Date(monthsList[0] + '-01'))
      )
    )
    .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`, transactions.type)
    .orderBy(sql`to_char(${transactions.date}, 'YYYY-MM')`);

  // Build result for all months (including empty ones)
  const result = monthsList.map((month) => {
    const monthData = monthlyData.filter((m) => m.month === month);
    const income = parseFloat(
      monthData.find((m) => m.type === 'income')?.amount ?? '0'
    );
    const expenses = parseFloat(
      monthData.find((m) => m.type === 'expense')?.amount ?? '0'
    );

    return {
      month,
      income,
      expenses,
      balance: income - expenses,
    };
  });

  return c.json({ items: result });
});

export default app;
export type ReportsApp = typeof app;
