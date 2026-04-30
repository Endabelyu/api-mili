import { eq, and, like, desc, sql, SQL } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { transactions, categories } from '@db/schema';
import { processTransactionBalance } from './accounts.server';

export interface ListTransactionsOptions {
  userId: string;
  month?: string;
  type?: 'income' | 'expense' | 'transfer';
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listTransactions(options: ListTransactionsOptions) {
  const { userId, month, type, category, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const conditions: (SQL | undefined)[] = [eq(transactions.userId, userId)];

  if (month) {
    const startDate = `${month}-01`;
    const [year, monthNum] = month.split('-').map(Number);
    const nextMonth = new Date(year, monthNum, 1);
    const endDate = nextMonth.toISOString().slice(0, 10);
    
    conditions.push(
      sql`${transactions.date} >= ${startDate} AND ${transactions.date} < ${endDate}`
    );
  }

  if (type) {
    conditions.push(eq(transactions.type, type));
  }

  if (category) {
    conditions.push(eq(transactions.categoryId, category));
  }

  if (search) {
    conditions.push(like(transactions.description, `%${search}%`));
  }

  const items = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit,
    offset,
    with: { 
      category: true,
      account: true,
      toAccount: true
    },
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTransactionById(id: string, userId: string) {
  return await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
    with: { 
      category: true,
      account: true,
      toAccount: true
    },
  });
}

export interface CreateTransactionInput {
  userId: string;
  type: 'income' | 'expense' | 'transfer';
  amount: string;
  categoryId: string;
  accountId?: string;
  toAccountId?: string;
  description?: string | null;
  date: string;
}

export async function createTransaction(input: CreateTransactionInput) {
  const category = await db.query.categories.findFirst({
    where: eq(categories.id, input.categoryId),
  });

  if (!category) {
    throw new Error('Category not found');
  }

  return await db.transaction(async (tx) => {
    const [result] = await tx
      .insert(transactions)
      .values({
        type: input.type,
        amount: input.amount,
        categoryId: input.categoryId,
        accountId: input.accountId,
        toAccountId: input.toAccountId,
        description: input.description,
        date: new Date(input.date),
        userId: input.userId,
      })
      .returning();

    // Standard §21 — Auto-update account balances
    await processTransactionBalance(result, 'forward', tx);

    return result;
  });
}

export interface UpdateTransactionInput {
  type?: 'income' | 'expense' | 'transfer';
  amount?: string;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  description?: string | null;
  date?: string;
}

export async function updateTransaction(id: string, userId: string, input: UpdateTransactionInput) {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.transactions.findFirst({
      where: eq(transactions.id, id),
    });

    if (!existing) {
      throw Object.assign(new Error('Transaction not found'), { status: 404 });
    }

    if (existing.userId !== userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    // 1. Reverse old balance impact
    await processTransactionBalance(existing, 'reverse', tx);

    if (input.categoryId) {
      const category = await tx.query.categories.findFirst({
        where: eq(categories.id, input.categoryId),
      });
      if (!category) {
        throw Object.assign(new Error('Category not found'), { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.type) updateData.type = input.type;
    if (input.amount) updateData.amount = input.amount;
    if (input.categoryId) updateData.categoryId = input.categoryId;
    if (input.accountId) updateData.accountId = input.accountId;
    if (input.toAccountId !== undefined) updateData.toAccountId = input.toAccountId;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.date) updateData.date = new Date(input.date);

    const [result] = await tx
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();

    // 2. Apply new balance impact
    await processTransactionBalance(result, 'forward', tx);

    return result;
  });
}

export async function deleteTransaction(id: string, userId: string) {
  return await db.transaction(async (tx) => {
    const existing = await tx.query.transactions.findFirst({
      where: eq(transactions.id, id),
    });

    if (!existing) {
      throw Object.assign(new Error('Transaction not found'), { status: 404 });
    }

    if (existing.userId !== userId) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    // Reverse balance impact before deletion
    await processTransactionBalance(existing, 'reverse', tx);

    await tx.delete(transactions).where(eq(transactions.id, id));
    return { success: true };
  });
}

