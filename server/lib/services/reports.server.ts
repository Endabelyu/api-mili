import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { transactions, categories } from '@db/schema';

export async function getFinancialSummary(userId: string, month?: string) {
  let dateCondition;
  if (month) {
    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-');
    const nextMonth = String(Number(monthNum) + 1).padStart(2, '0');
    const endDate = `${year}-${nextMonth}-01`;
    dateCondition = sql`${transactions.date} >= ${startDate} AND ${transactions.date} < ${endDate}`;
  }

  const baseCondition = eq(transactions.userId, userId);

  const [incomeResult, expenseResult] = await Promise.all([
    db.select({
      total: sql<string | null>`sum(${transactions.amount})`,
      count: sql<number>`count(*)`,
    }).from(transactions).where(and(baseCondition, eq(transactions.type, 'income'), dateCondition)),
    db.select({
      total: sql<string | null>`sum(${transactions.amount})`,
      count: sql<number>`count(*)`,
    }).from(transactions).where(and(baseCondition, eq(transactions.type, 'expense'), dateCondition)),
  ]);

  const income = parseFloat(incomeResult[0]?.total ?? '0');
  const expenses = parseFloat(expenseResult[0]?.total ?? '0');
  const balance = income - expenses;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

  return {
    income,
    expenses,
    balance,
    savingsRate: parseFloat(savingsRate.toFixed(2)),
    transactionCount: (incomeResult[0]?.count ?? 0) + (expenseResult[0]?.count ?? 0),
  };
}

export async function getExpensesByCategory(userId: string, month?: string) {
  let dateCondition;
  if (month) {
    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-');
    const nextMonth = String(Number(monthNum) + 1).padStart(2, '0');
    const endDate = `${year}-${nextMonth}-01`;
    dateCondition = sql`${transactions.date} >= ${startDate} AND ${transactions.date} < ${endDate}`;
  }

  const categoryData = await db
    .select({
      categoryId: transactions.categoryId,
      label: categories.label,
      color: categories.color,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'expense'), dateCondition))
    .groupBy(transactions.categoryId, categories.label, categories.color)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  const totalExpenses = categoryData.reduce((sum, cat) => sum + parseFloat(cat.amount), 0);

  return categoryData.map((cat) => ({
    categoryId: cat.categoryId,
    label: cat.label,
    color: cat.color,
    amount: parseFloat(cat.amount),
    percentage: totalExpenses > 0
      ? parseFloat(((parseFloat(cat.amount) / totalExpenses) * 100).toFixed(2))
      : 0,
  }));
}

export async function getMonthlyTrend(userId: string, months = 6) {
  const monthsList: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // Build a full date string so Drizzle passes it as a single typed parameter
  const startDate = `${monthsList[0]}-01`;

  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      type: transactions.type,
      amount: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      sql`${transactions.date} >= ${startDate}::timestamp`
    ))
    .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`, transactions.type)
    .orderBy(sql`to_char(${transactions.date}, 'YYYY-MM')`);

  return monthsList.map((month) => {
    const monthData = monthlyData.filter((m) => m.month === month);
    const income = parseFloat(monthData.find((m) => m.type === 'income')?.amount ?? '0');
    const expenses = parseFloat(monthData.find((m) => m.type === 'expense')?.amount ?? '0');
    return { month, income, expenses, balance: income - expenses };
  });
}
