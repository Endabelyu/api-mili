import { Hono } from 'hono';
import { requireAuth } from '../lib/auth-middleware.server';
import { HTTPException } from 'hono/http-exception';

const app = new Hono();

app.use('*', requireAuth);

// Mock data in memory to simulate persistence
let mockNotifications = [
  { id: '1', title: 'Tagihan Listrik jatuh tempo 2 hari lagi', amount: 'Rp 380.000', time: '2J LALU', icon: 'Zap', color: 'bg-orange-50', iconColor: 'text-orange-500', unread: true },
  { id: '2', title: 'Anggaran Kopi hampir habis (92%)', amount: 'Sisa Rp 40.000 dari Rp 500.000', time: '5J LALU', icon: 'Coffee', color: 'bg-indigo-50', iconColor: 'text-indigo-500', unread: true },
  { id: '3', title: 'Target Dana Darurat mencapai 70%!', amount: 'Tinggal Rp 18 juta lagi', time: 'KEMARIN', icon: 'Target', color: 'bg-emerald-50', iconColor: 'text-emerald-500', unread: true },
  { id: '4', title: 'Transaksi besar terdeteksi', amount: 'Rp 850.000 • Belanja', time: 'KEMARIN', icon: 'Shopping', color: 'bg-rose-50', iconColor: 'text-rose-500', unread: false },
  { id: '5', title: 'Gaji April masuk', amount: 'Rp 18.500.000 • Bank Jago', time: '3 HARI LALU', icon: 'Salary', color: 'bg-emerald-50', iconColor: 'text-emerald-500', unread: false },
];

app.get('/', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  return c.json({ items: mockNotifications });
});

app.post('/mark-all-read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  mockNotifications = mockNotifications.map(n => ({ ...n, unread: false }));
  return c.json({ success: true });
});

app.put('/:id/read', async (c) => {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' });

  const { id } = c.req.param();
  mockNotifications = mockNotifications.map(n => 
    n.id === id ? { ...n, unread: false } : n
  );
  return c.json({ success: true });
});

export default app;
