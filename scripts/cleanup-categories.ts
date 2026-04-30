
import 'dotenv/config';
import { db } from './server/lib/db';
import { categories, transactions } from './db/schema';
import { sql, eq, inArray, notInArray } from 'drizzle-orm';

const seedIds = [
  'acc-bank', 'acc-credit', 'acc-cash', 'acc-crypto', 'acc-investment',
  'goal-savings', 'goal-house', 'goal-car', 'goal-education', 'goal-wedding',
  'goal-travel', 'goal-retirement', 'goal-emergency', 'goal-gadget', 'goal-charity', 'goal-hajj',
  'bill-rent', 'bill-insurance', 'bill-tax', 'bill-water', 'bill-electric', 'bill-internet', 'bill-gas', 'bill-phone', 'bill-streaming',
  'makan', 'belanja', 'kopi', 'transport', 'bensin', 'parkir', 'pakaian', 'perawatan',
  'fam-baby', 'fam-school', 'fam-toy', 'fam-parents',
  'health-med', 'health-doctor', 'health-gym',
  'gaji', 'bonus', 'freelance', 'invest-profit', 'sales',
  'debt-active', 'debt-credit-card',
  'misc-hobby', 'misc-pet', 'misc-unexpected',
  'transfer'
];

const MAPPING: Record<string, string> = {
  'food': 'makan',
  'salary': 'gaji',
  'belanjaan': 'belanja',
  'internet': 'bill-internet',
  'kesehatan': 'health-doctor',
  'pajak': 'bill-tax',
  'tagihan': 'bill-phone', // conservative guess
  'sewa': 'bill-rent',
  'investasi': 'acc-investment'
};

async function main() {
  console.log('🚀 Starting Backend Category Cleanup...');

  // 1. Re-map transactions
  console.log('📦 Re-mapping transactions...');
  for (const [oldId, newId] of Object.entries(MAPPING)) {
    const result = await db.update(transactions)
      .set({ categoryId: newId })
      .where(eq(transactions.categoryId, oldId))
      .returning();
    
    if (result.length > 0) {
      console.log(`✅ Re-mapped ${result.length} transactions from "${oldId}" to "${newId}"`);
    }
  }

  // 2. Delete orphan categories
  console.log('🗑️ Deleting orphan categories...');
  const orphans = await db.select({ id: categories.id })
    .from(categories)
    .where(notInArray(categories.id, seedIds));
  
  const orphanIds = orphans.map(o => o.id);
  
  if (orphanIds.length > 0) {
    // We use a loop or chunks to avoid potential parameter limits, though 19 is small
    await db.delete(categories).where(inArray(categories.id, orphanIds));
    console.log(`✅ Deleted ${orphanIds.length} orphan categories: ${orphanIds.join(', ')}`);
  } else {
    console.log('✨ No orphan categories found.');
  }

  console.log('⭐ Cleanup complete! The DB now only contains the 51 standard categories.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
