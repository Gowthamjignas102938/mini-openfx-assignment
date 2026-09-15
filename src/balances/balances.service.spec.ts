/**
 * Integration test: runs against the real, isolated Postgres container,
 * since BalancesService is a thin read layer over the actual table.
 */
import { db } from '../db/index.js';
import { balances } from '../db/schema.js';
import { BalancesService } from './balances.service.js';

describe('BalancesService (integration)', () => {
  let service: BalancesService;

  beforeEach(async () => {
    service = new BalancesService();
    // Upsert, not update: on a fresh database (e.g. CI, right after
    // migrations, before any seed has run) none of these rows exist yet.
    for (const [currency, amount] of Object.entries({
      USD: '42.000000',
      INR: '0.000000',
      BTC: '0.000000',
    })) {
      await db
        .insert(balances)
        .values({ currency, amount })
        .onConflictDoUpdate({
          target: balances.currency,
          set: { amount, updatedAt: new Date() },
        });
    }
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it('getAllBalances returns all three seeded currencies', async () => {
    const result = await service.getAllBalances();
    const currencies = result.map((row) => row.currency).sort();
    expect(currencies).toEqual(['BTC', 'INR', 'USD']);
  });

  it('getBalance returns the matching row for a known currency', async () => {
    const result = await service.getBalance('USD');
    expect(result?.amount).toBe('42.000000');
  });

  it('getBalance returns undefined for an unknown currency', async () => {
    const result = await service.getBalance('ZZZ');
    expect(result).toBeUndefined();
  });
});
