import { db } from './index.js';
import { balances } from './schema.js';

async function main() {
  await db
    .insert(balances)
    .values([
      { currency: 'USD', amount: '10000' },
      { currency: 'INR', amount: '0' },
      { currency: 'BTC', amount: '0' },
      { currency: 'EUR', amount: '0' },
      { currency: 'MXN', amount: '0' },
    ])
    .onConflictDoNothing();

  console.log('Seeded starting balances (USD 10000, INR 0, BTC 0, EUR 0, MXN 0).');
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
