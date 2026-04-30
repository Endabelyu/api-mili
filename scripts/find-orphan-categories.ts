
import 'dotenv/config';
import { db } from './server/lib/db';
import { categories, transactions } from './db/schema';
import { sql, eq, notInArray } from 'drizzle-orm';

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

async function main() {
  console.log('Checking for categories not in seed...');
  
  const orphans = await db.select({
    id: categories.id,
    label: categories.label,
    count: sql<number>`count(${transactions.id})`.mapWith(Number)
  })
  .from(categories)
  .leftJoin(transactions, eq(categories.id, transactions.categoryId))
  .where(notInArray(categories.id, seedIds))
  .groupBy(categories.id, categories.label);

  console.log('Orphan Categories:');
  console.table(orphans);
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
