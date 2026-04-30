import 'dotenv/config';
import { db } from '@server/lib/db';
import { categories, users, transactions, budgets, accounts } from './schema';
import { eq } from 'drizzle-orm';

const defaultCategories = [
  // --- 🏦 AKUN (Account Types) ---
  { id: 'acc-bank', label: 'Bank', color: '#2E90FA', icon: 'category_bank', type: 'both' },
  { id: 'acc-credit', label: 'Kartu Kredit', color: '#F04438', icon: 'category_credit_card', type: 'both' },
  { id: 'acc-cash', label: 'Tunai', color: '#12B76A', icon: 'category_cash', type: 'both' },
  { id: 'acc-crypto', label: 'Crypto', color: '#F79009', icon: 'category_crypto', type: 'both' },
  { id: 'acc-investment', label: 'Investasi', color: '#6172F3', icon: 'category_investment', type: 'both' },

  // --- 🎯 TARGET / GOALS ---
  { id: 'goal-savings', label: 'Tabungan', color: '#F670C7', icon: 'category_savings', type: 'expense' },
  { id: 'goal-house', label: 'Rumah', color: '#B54708', icon: 'category_housing', type: 'expense' },
  { id: 'goal-car', label: 'Mobil', color: '#475467', icon: 'category_car', type: 'expense' },
  { id: 'goal-education', label: 'Pendidikan', color: '#0BA5EC', icon: 'category_education', type: 'expense' },
  { id: 'goal-wedding', label: 'Pernikahan', color: '#F670C7', icon: 'category_wedding', type: 'expense' },
  { id: 'goal-travel', label: 'Liburan', color: '#079455', icon: 'category_travel', type: 'expense' },
  { id: 'goal-retirement', label: 'Pensiun', color: '#F79009', icon: 'category_retirement', type: 'expense' },
  { id: 'goal-emergency', label: 'Dana Darurat', color: '#F04438', icon: 'category_emergency', type: 'expense' },
  { id: 'goal-gadget', label: 'Gadget', color: '#53389E', icon: 'category_gadget', type: 'expense' },
  { id: 'goal-charity', label: 'Zakat/Sedekah', color: '#12B76A', icon: 'category_charity', type: 'expense' },
  { id: 'goal-hajj', label: 'Haji', color: '#065F46', icon: 'category_hajj', type: 'expense' },
  { id: 'goal-umrah', label: 'Umrah', color: '#0086C9', icon: 'category_hajj', type: 'expense' },
  { id: 'goal-qurban', label: 'Qurban', color: '#12B76A', icon: '🐑', type: 'expense' },

  // --- 📋 ANGGARAN & TAGIAN (Bills) ---
  { id: 'bill-rent', label: 'Sewa/KPR', color: '#B54708', icon: 'category_housing', type: 'expense' },
  { id: 'bill-insurance', label: 'Asuransi', color: '#667085', icon: 'category_insurance', type: 'expense' },
  { id: 'bill-tax', label: 'Pajak', color: '#475467', icon: 'category_tax', type: 'expense' },
  { id: 'bill-water', label: 'Air', color: '#0086C9', icon: 'category_water', type: 'expense' },
  { id: 'bill-electric', label: 'Listrik', color: '#F79009', icon: 'category_electric', type: 'expense' },
  { id: 'bill-internet', label: 'Internet/WiFi', color: '#6172F3', icon: 'category_internet', type: 'expense' },
  { id: 'bill-gas', label: 'Gas/LPG', color: '#F04438', icon: 'category_gas', type: 'expense' },
  { id: 'bill-phone', label: 'Pulsa', color: '#EE46BC', icon: 'category_bills', type: 'expense' },
  { id: 'bill-streaming', label: 'Streaming', color: '#E31B23', icon: 'category_entertainment', type: 'expense' },

  // --- 🛒 PENGELUARAN HARIAN (Daily) ---
  { id: 'makan', label: 'Makan & Minum', color: '#F97066', icon: 'category_food', type: 'expense' },
  { id: 'belanja', label: 'Belanja Dapur', color: '#EE46BC', icon: 'category_shopping', type: 'expense' },
  { id: 'kopi', label: 'Kopi/Kafe', color: '#B54708', icon: 'category_food', type: 'expense' },
  { id: 'transport', label: 'Transportasi', color: '#2E90FA', icon: 'category_transport', type: 'expense' },
  { id: 'bensin', label: 'Bensin/BBM', color: '#475467', icon: 'category_transport', type: 'expense' },
  { id: 'parkir', label: 'Parkir/Tol', color: '#667085', icon: 'category_transport', type: 'expense' },
  { id: 'pakaian', label: 'Pakaian', color: '#717BBC', icon: 'category_clothing', type: 'expense' },
  { id: 'perawatan', label: 'Perawatan Diri', color: '#F670C7', icon: 'category_health', type: 'expense' },

  // --- 👨👩👧 KELUARGA & ANAK ---
  { id: 'fam-baby', label: 'Kebutuhan Bayi', color: '#0BA5EC', icon: 'category_family', type: 'expense' },
  { id: 'fam-school', label: 'Sekolah Anak', color: '#6172F3', icon: 'category_education', type: 'expense' },
  { id: 'fam-toy', label: 'Mainan/Hiburan', color: '#F79009', icon: 'category_hobby', type: 'expense' },
  { id: 'fam-parents', label: 'Orang Tua', color: '#717BBC', icon: 'category_family', type: 'expense' },

  // --- 💊 KESEHATAN ---
  { id: 'health-med', label: 'Obat-obatan', color: '#F04438', icon: 'category_health', type: 'expense' },
  { id: 'health-doctor', label: 'Dokter/RS', color: '#F97066', icon: 'category_health', type: 'expense' },
  { id: 'health-gym', label: 'Gym/Olahraga', color: '#12B76A', icon: 'category_gym', type: 'expense' },

  // --- 💼 PEMASUKAN ---
  { id: 'gaji', label: 'Gaji', color: '#15803D', icon: 'category_salary', type: 'income' },
  { id: 'bonus', label: 'Bonus/THR', color: '#F79009', icon: 'category_gift', type: 'income' },
  { id: 'freelance', label: 'Freelance', color: '#2E90FA', icon: 'category_freelance', type: 'income' },
  { id: 'invest-profit', label: 'Profit Investasi', color: '#12B76A', icon: 'category_investment', type: 'income' },
  { id: 'sales', label: 'Penjualan', color: '#EE46BC', icon: 'category_shopping', type: 'income' },

  // --- ⛓️ HUTANG & CICILAN ---
  { id: 'debt-active', label: 'Bayar Hutang', color: '#475467', icon: 'category_debt', type: 'expense' },
  { id: 'debt-credit-card', label: 'Tagihan CC', color: '#F04438', icon: 'category_credit_card', type: 'expense' },

  // --- 🎲 LAIN-LAIN ---
  { id: 'misc-hobby', label: 'Hobi', color: '#6172F3', icon: 'category_hobby', type: 'expense' },
  { id: 'misc-pet', label: 'Peliharaan', color: '#F79009', icon: 'category_pet', type: 'expense' },
  { id: 'misc-unexpected', label: 'Tak Terduga', color: '#667085', icon: 'category_emergency', type: 'expense' },
  
  // --- SYSTEM ---
  { id: 'transfer', label: 'Transfer', color: '#6172F3', icon: 'category_cash', type: 'both' },
];

const DEMO_USER_ID = 'demo-user-001';

async function main() {
  console.log('🌱 Seeding database with updated icons...');

  // Create/Update Demo User
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

  console.log(`Inserting ${defaultCategories.length} categories...`);
  for (const cat of defaultCategories) {
    await db.insert(categories).values(cat).onConflictDoUpdate({
      target: categories.id,
      set: cat,
    });
  }

  console.log('Inserting accounts...');
  const demoAccounts = [
    { name: 'Bank Mandiri', type: 'bank', balance: '15000000', color: '#2E90FA', userId, isDefault: true },
    { name: 'BCA Tabungan', type: 'bank', balance: '50000000', color: '#0BA5EC', userId },
    { name: 'Dompet Tunai', type: 'cash', balance: '500000', color: '#12B76A', userId },
    { name: 'Gopay', type: 'e-wallet', balance: '1200000', color: '#0086C9', userId },
    { name: 'Saham BBCA', type: 'investment', balance: '25000000', color: '#EE46BC', userId },
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
