
import { db } from './server/lib/db';
import { transactions } from './db/schema/transactions';

async function main() {
  const allTxns = await db.select().from(transactions);
  console.log(JSON.stringify(allTxns, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
