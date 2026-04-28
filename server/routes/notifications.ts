import { Hono } from 'hono';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';
import * as fs from 'fs';
import * as path from 'path';

const app = new Hono();

app.use('*', requireAuth);

const persistencePath = path.resolve(process.cwd(), 'notifications_state.json');

function getNotifications() {
  if (fs.existsSync(persistencePath)) {
    try {
      return JSON.parse(fs.readFileSync(persistencePath, 'utf8'));
    } catch {
      // fallback
    }
  }
  return [
    { id: '1', title: 'Tagihan Listrik jatuh tempo 2 hari lagi', amount: 'Rp 380.000', time: '2J LALU', icon: 'Zap', color: 'bg-orange-50', iconColor: 'text-orange-500', unread: true },
    { id: '2', title: 'Anggaran Kopi hampir habis (92%)', amount: 'Sisa Rp 40.000 dari Rp 500.000', time: '5J LALU', icon: 'Coffee', color: 'bg-indigo-50', iconColor: 'text-indigo-500', unread: true },
    { id: '3', title: 'Target Dana Darurat mencapai 70%!', amount: 'Tinggal Rp 18 juta lagi', time: 'KEMARIN', icon: 'Target', color: 'bg-emerald-50', iconColor: 'text-emerald-500', unread: true },
    { id: '4', title: 'Transaksi besar terdeteksi', amount: 'Rp 850.000 • Belanja', time: 'KEMARIN', icon: 'Shopping', color: 'bg-rose-50', iconColor: 'text-rose-500', unread: false },
    { id: '5', title: 'Gaji April masuk', amount: 'Rp 18.500.000 • Bank Jago', time: '3 HARI LALU', icon: 'Salary', color: 'bg-emerald-50', iconColor: 'text-emerald-500', unread: false },
  ];
}

function saveNotifications(data: any) {
  try {
    fs.writeFileSync(persistencePath, JSON.stringify(data, null, 2));
  } catch {
    // fallback
  }
}

app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  return c.json({ items: getNotifications() });
});

app.post('/mark-all-read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const notifications = getNotifications().map((n: any) => ({ ...n, unread: false }));
  saveNotifications(notifications);
  return c.json({ success: true });
});

app.put('/:id/read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const { id } = c.req.param();
  const notifications = getNotifications().map((n: any) => 
    n.id === id ? { ...n, unread: false } : n
  );
  saveNotifications(notifications);
  return c.json({ success: true });
});

export default app;
