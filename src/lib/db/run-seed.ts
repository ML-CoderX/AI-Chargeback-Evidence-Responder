// Seed runner — invoked by `npm run seed`
import { seedDatabase } from './seed';

async function main() {
  console.log('Seeding database with 80 synthetic disputes...');
  const result = await seedDatabase();
  console.log(`Done: ${result.total} disputes (${result.train} train, ${result.holdout} holdout)`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
