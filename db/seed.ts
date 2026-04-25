import 'dotenv/config';
import { db } from '@server/lib/db';
import { categories, users, transactions, budgets, accounts } from './schema';
import { eq } from 'drizzle-orm';

// New requested categories from screenshot
const defaultCategories = [
  // Expense categories
  { id: 'makan', label: 'Makan', color: '#F97066', icon: '🍽️', type: 'expense' },
  { id: 'kopi', label: 'Kopi', color: '#7A5AF8', icon: '☕', type: 'expense' },
  { id: 'transport', label: 'Transport', color: '#2E90FA', icon: '🚗', type: 'expense' },
  { id: 'belanja', label: 'Belanja', color: '#EE46BC', icon: '🛍️', type: 'expense' },
  { id: 'belanjaan', label: 'Belanjaan', color: '#12B76A', icon: '🛒', type: 'expense' },
  { id: 'tagihan', label: 'Tagihan', color: '#667085', icon: '📄', type: 'expense' },
  { id: 'sewa', label: 'Sewa', color: '#B54708', icon: '🏠', type: 'expense' },
  { id: 'kesehatan', label: 'Kesehatan', color: '#F04438', icon: '💊', type: 'expense' },
  { id: 'hiburan', label: 'Hiburan', color: '#6172F3', icon: '🎬', type: 'expense' },
  { id: 'langganan', label: 'Langganan', color: '#EE46BC', icon: '📺', type: 'expense' },
  { id: 'pendidikan', label: 'Pendidikan', color: '#0BA5EC', icon: '📚', type: 'expense' },
  { id: 'olahraga', label: 'Olahraga', color: '#F79009', icon: '🏋️', type: 'expense' },
  { id: 'perjalanan', label: 'Perjalanan', color: '#079455', icon: '✈️', type: 'expense' },
  { id: 'hadiah', label: 'Hadiah', color: '#F670C7', icon: '🎁', type: 'expense' },
  { id: 'peliharaan', label: 'Peliharaan', color: '#717BBC', icon: '🐾', type: 'expense' },
  { id: 'kecantikan', label: 'Kecantikan', color: '#FD6974', icon: '💄', type: 'expense' },
  { id: 'telepon', label: 'Telepon', color: '#53389E', icon: '📱', type: 'expense' },
  { id: 'internet', label: 'Internet', color: '#0086C9', icon: '🌐', type: 'expense' },
  { id: 'pajak', label: 'Pajak', color: '#475467', icon: '🏛️', type: 'expense' },
  { id: 'donasi', label: 'Donasi', color: '#F04438', icon: '❤️', type: 'expense' },
  
  // Income categories
  { id: 'gaji', label: 'Gaji', color: '#12B76A', icon: '💰', type: 'income' },
  { id: 'bonus', label: 'Bonus', color: '#F79009', icon: '🎁', type: 'income' },
  { id: 'investasi', label: 'Investasi', color: '#2E90FA', icon: '📈', type: 'income' },
];

// Demo user data
const DEMO_USER_ID = 'demo-user-001';

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Demo User
  const userResult = await db.insert(users).values({
    id: DEMO_USER_ID,
    email: 'demo@personalfinance.app',
    name: 'Demo User',
    emailVerified: true,
  }).onConflictDoUpdate({
    target: users.email,
    set: { name: 'Demo User', emailVerified: true }
  }).returning({ id: users.id });

  const userId = userResult[0].id;

  // 2. Seed Categories
  console.log('Inserting categories...');
  for (const cat of defaultCategories) {
    await db.insert(categories).values(cat).onConflictDoUpdate({
      target: categories.id,
      set: cat,
    });
  }

  // 3. Seed Accounts (from screenshot)
  console.log('Inserting accounts...');
  const demoAccounts = [
    { name: 'Saham', type: 'investment', balance: '25000000', color: '#EE46BC', userId },
    { name: 'Reksa Dana', type: 'investment', balance: '10000000', color: '#12B76A', userId },
    { name: 'Deposito', type: 'bank', balance: '50000000', color: '#0BA5EC', userId },
    { name: 'Tabungan Bank', type: 'bank', balance: '15000000', color: '#2E90FA', userId, isDefault: true },
    { name: 'Emas', type: 'investment', balance: '5000000', color: '#F79009', userId },
  ];

  for (const acc of demoAccounts) {
    await db.insert(accounts).values(acc).onConflictDoNothing();
  }

  console.log('✅ Seeding completed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
