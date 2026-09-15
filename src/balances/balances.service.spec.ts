/**
 * Integration test: runs against the real, isolated Postgres container,
 * since BalancesService is a thin read layer over the actual table.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { balances } from '../db/schema.js';
import { BalancesService } from './balances.service.js';

describe('BalancesService (integration)', () => {
  let service: BalancesService;

  beforeEach(async () => {
    service = new BalancesService();
    await db
      .update(balances)
      .set({ amount: '42.000000', updatedAt: new Date() })
      .where(eq(balances.currency, 'USD'));
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
