
import 'dotenv/config';
import { db } from './server/lib/db';
import { categories } from './db/schema';

async function main() {
  const allCats = await db.select().from(categories);
  console.log(`Found ${allCats.length} categories.`);
  console.log(JSON.stringify(allCats.slice(0, 5), null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
