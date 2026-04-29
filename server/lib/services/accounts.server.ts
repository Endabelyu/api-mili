import { eq, sql } from 'drizzle-orm';
import { db } from '@server/lib/db';
import { accounts } from '@db/schema';

// Standard §21 — Type compatibility for transactions and main DB instance
export async function adjustAccountBalance(
  accountId: string,
  amount: string,
  operation: 'add' | 'subtract',
  tx: any = db
) {
  const amountNum = parseFloat(amount);
  const adjustment = operation === 'add' ? amountNum : -amountNum;

  await tx
    .update(accounts)
    .set({
      balance: sql`${accounts.balance} + ${adjustment}`,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

export interface TransactionBalanceInfo {
  type: string;
  amount: string;
  accountId: string | null;
  toAccountId?: string | null;
}

export async function processTransactionBalance(
  transaction: TransactionBalanceInfo,
  direction: 'forward' | 'reverse',
  tx: any = db
) {
  const { type, amount, accountId, toAccountId } = transaction;

  if (!accountId) return;

  const isForward = direction === 'forward';

  if (type === 'income') {
    await adjustAccountBalance(accountId, amount, isForward ? 'add' : 'subtract', tx);
  } else if (type === 'expense') {
    await adjustAccountBalance(accountId, amount, isForward ? 'subtract' : 'add', tx);
  } else if (type === 'transfer' && toAccountId) {
    // Subtract from source
    await adjustAccountBalance(accountId, amount, isForward ? 'subtract' : 'add', tx);
    // Add to destination
    await adjustAccountBalance(toAccountId, amount, isForward ? 'add' : 'subtract', tx);
  }
}

