
import 'dotenv/config';
import { db } from './server/lib/db';
import { categories } from './db/schema';

async function main() {
  const allCats = await db.select().from(categories);
  const ids = allCats.map(c => c.id).sort();
  console.log(JSON.stringify(ids, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
