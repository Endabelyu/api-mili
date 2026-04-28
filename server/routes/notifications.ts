import { Hono } from 'hono';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';
import { db } from '../lib/db';
import { notifications, budgets, transactions, targets, scheduledTransactions } from '../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

const app = new Hono();

app.use('*', requireAuth);

app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  // 1. DYNAMIC BUDGETS TRIGGER
  const currentMonth = new Date().toISOString().slice(0, 7);
  const userBudgets = await db.query.budgets.findMany({
    where: and(eq(budgets.userId, user.id), eq(budgets.month, currentMonth)),
    with: { category: true },
  });

  const startDate = `${currentMonth}-01`;
  const [year, monthNum] = currentMonth.split('-');
  const nextMonthDate = new Date(Number(year), Number(monthNum), 1);
  const endDate = nextMonthDate.toISOString().slice(0, 10);

  const spendingByCategory = await db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`COALESCE(sum(${transactions.amount}), '0')`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.type, 'expense'),
        sql`${transactions.date} >= ${startDate}::date AND ${transactions.date} < ${endDate}::date`
      )
    )
    .groupBy(transactions.categoryId);

  const spendingMap = new Map(spendingByCategory.map((s) => [s.categoryId, s.total]));

  for (const b of userBudgets) {
    const spent = parseFloat(spendingMap.get(b.categoryId) ?? '0');
    const limit = parseFloat(b.limitAmount);
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;

    if (percentage >= 80) {
      const title = `Anggaran ${b.category?.label || 'Kategori'} hampir habis (${Math.round(percentage)}%)`;
      const existing = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, user.id), eq(notifications.title, title)),
      });
      if (!existing) {
        await db.insert(notifications).values({
          userId: user.id,
          title,
          amount: `Sisa Rp ${(limit - spent).toLocaleString('id-ID')} dari Rp ${limit.toLocaleString('id-ID')}`,
          time: 'BARU SAJA',
          icon: 'Coffee',
          color: 'bg-indigo-50',
          iconColor: 'text-indigo-500',
          unread: true,
        });
      }
    }
  }

  // 2. DYNAMIC TARGETS TRIGGER
  const userTargets = await db.query.targets.findMany({
    where: eq(targets.userId, user.id),
  });

  for (const t of userTargets) {
    const targetAmt = parseFloat(t.targetAmount);
    const currentAmt = parseFloat(t.currentAmount);
    const targetPct = targetAmt > 0 ? (currentAmt / targetAmt) * 100 : 0;

    if (targetPct >= 100) {
      const title = `Target ${t.name} Berhasil Dicapai! 🎉`;
      const existing = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, user.id), eq(notifications.title, title)),
      });
      if (!existing) {
        await db.insert(notifications).values({
          userId: user.id,
          title,
          amount: `Lengkap Rp ${targetAmt.toLocaleString('id-ID')}`,
          time: 'BARU SAJA',
          icon: 'Target',
          color: 'bg-emerald-50',
          iconColor: 'text-emerald-500',
          unread: true,
        });
      }
    }
  }

  // 3. DYNAMIC SCHEDULED TRANSACTIONS approaching
  const userScheduled = await db.query.scheduledTransactions.findMany({
    where: and(eq(scheduledTransactions.userId, user.id), eq(scheduledTransactions.status, 'active')),
  });

  const now = new Date();
  for (const s of userScheduled) {
    const nextRun = new Date(s.nextRunDate);
    const diffTime = nextRun.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 3 && diffDays >= 0) {
      const title = `Transaksi Terjadwal Segera Jatuh Tempo`;
      const existing = await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, user.id), eq(notifications.title, title), eq(notifications.amount, s.description || 'Tagihan')),
      });
      if (!existing) {
        await db.insert(notifications).values({
          userId: user.id,
          title,
          amount: s.description || 'Tagihan Pembayaran Terjadwal',
          time: `${diffDays === 0 ? 'HARI INI' : diffDays + ' HARI LAGI'}`,
          icon: 'Zap',
          color: 'bg-orange-50',
          iconColor: 'text-orange-500',
          unread: true,
        });
      }
    }
  }

  // Fetch final list
  const finalItems = await db.query.notifications.findMany({
    where: eq(notifications.userId, user.id),
    orderBy: (notifications, { desc }) => [desc(notifications.createdAt)],
  });

  return c.json({ items: finalItems });
});

app.post('/mark-all-read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  await db.update(notifications)
    .set({ unread: false })
    .where(and(eq(notifications.userId, user.id), eq(notifications.unread, true)));

  return c.json({ success: true });
});

app.put('/:id/read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const { id } = c.req.param();
  await db.update(notifications)
    .set({ unread: false })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));

  return c.json({ success: true });
});

export default app;
