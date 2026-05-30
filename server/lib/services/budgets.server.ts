import { eq, and, sql, sum } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { budgets, transactions, categories } from '@db/schema';

export async function listBudgetsWithSpending(userId: string, month: string) {
  const userBudgets = await db.query.budgets.findMany({
    where: and(eq(budgets.userId, userId), eq(budgets.month, month)),
    with: { category: true },
  });

  const startDate = `${month}-01`;
  const [year, monthNum] = month.split('-').map(Number);
  const endDate = new Date(year, monthNum, 1).toISOString().slice(0, 10);

  const spendingByCategory = await db
    .select({
      categoryId: transactions.categoryId,
      total: sum(transactions.amount),
    })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, 'expense'),
      sql`${transactions.date} >= ${startDate}::timestamp AND ${transactions.date} < ${endDate}::timestamp`
    ))
    .groupBy(transactions.categoryId);

  const spendingMap = new Map(spendingByCategory.map(s => [s.categoryId, s.total ?? '0']));

  const budgetsWithSpending = userBudgets.map((budget) => {
    const spent = spendingMap.get(budget.categoryId) ?? '0';
    const limitAmount = parseFloat(budget.limitAmount);
    const spentAmount = parseFloat(spent);

    return {
      ...budget,
      spent: spentAmount.toFixed(2),
      remaining: (limitAmount - spentAmount).toFixed(2),
      percentageUsed: limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0,
    };
  });

  return budgetsWithSpending;
}

export interface UpsertBudgetInput {
  userId: string;
  categoryId: string;
  limitAmount: string;
  month: string;
}

export async function upsertBudget(input: UpsertBudgetInput) {
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, input.categoryId),
  });

  if (!category) {
    throw Object.assign(new Error('Category not found'), { status: 400 });
  }

  const existing = await db.query.budgets.findFirst({
    where: and(
      eq(budgets.userId, input.userId),
      eq(budgets.categoryId, input.categoryId),
      eq(budgets.month, input.month)
    ),
  });

  if (existing) {
    const result = await db
      .update(budgets)
      .set({ limitAmount: input.limitAmount })
      .where(eq(budgets.id, existing.id))
      .returning();
    return { ...result[0], updated: true };
  }

  const result = await db
    .insert(budgets)
    .values({
      userId: input.userId,
      categoryId: input.categoryId,
      limitAmount: input.limitAmount,
      month: input.month,
    })
    .returning();

  return { ...result[0], updated: false };
}

export async function deleteBudget(id: string, userId: string) {
  const existing = await db.query.budgets.findFirst({
    where: eq(budgets.id, id),
  });

  if (!existing) {
    throw Object.assign(new Error('Budget not found'), { status: 404 });
  }

  if (existing.userId !== userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  await db.delete(budgets).where(eq(budgets.id, id));
  return { success: true };
}
