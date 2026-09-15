/**
 * Integration test: runs against the real, isolated Postgres container
 * (docker compose up -d) rather than a mock, since TradesService's
 * transaction/atomicity guarantees are exactly what's under test here.
 * Only PricesService is faked, since it's genuinely external (Binance/Redis).
 */
import { jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { balances, trades } from '../db/schema.js';
import { TradesService } from './trades.service.js';
import type { PricesService } from '../prices/prices.service.js';

const TEST_BALANCES: Record<string, string> = {
  USD: '1000.000000',
  INR: '500.000000',
  BTC: '1.000000',
};

async function currentAmount(currency: string): Promise<number> {
  const [row] = await db.select().from(balances).where(eq(balances.currency, currency));
  return Number(row.amount);
}

describe('TradesService (integration)', () => {
  let pricesService: { getCachedPriceOnly: jest.Mock<(...args: any[]) => any> };
  let tradesService: TradesService;

  beforeEach(async () => {
    pricesService = { getCachedPriceOnly: jest.fn() };
    tradesService = new TradesService(pricesService as unknown as PricesService);

    await db.delete(trades);
    for (const [currency, amount] of Object.entries(TEST_BALANCES)) {
      // Upsert, not update: on a fresh database (e.g. CI, right after
      // migrations, before any seed has run) these rows don't exist yet —
      // an update() would silently affect zero rows and the test would
      // fail confusingly downstream instead of setting up its own fixture.
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

  it('executes a valid trade: debits fromCurrency, credits toCurrency, inserts one trade row', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    const trade = await tradesService.executeTrade({
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: 10,
      symbol: 'BTCUSDT',
    });

    expect(trade.fromAmount).toBe('10.000000');
    expect(Number(trade.toAmount)).toBeCloseTo(1000, 5);
    expect(await currentAmount('USD')).toBe(990);
    expect(await currentAmount('BTC')).toBe(1001);

    const allTrades = await db.select().from(trades);
    expect(allTrades).toHaveLength(1);
  });

  it('rejects with 409 on a cache miss and makes no changes at all', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue(null);

    await expect(
      tradesService.executeTrade({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        fromAmount: 10,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('No valid cached price');

    expect(await currentAmount('USD')).toBe(1000);
    expect(await db.select().from(trades)).toHaveLength(0);
  });

  it('rejects insufficient funds and rolls back completely (no partial writes)', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    await expect(
      tradesService.executeTrade({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        fromAmount: 999999,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('Insufficient USD balance');

    expect(await currentAmount('USD')).toBe(1000);
    expect(await currentAmount('BTC')).toBe(1);
    expect(await db.select().from(trades)).toHaveLength(0);
  });

  it('rejects an unknown currency', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    await expect(
      tradesService.executeTrade({
        fromCurrency: 'ZZZ',
        toCurrency: 'BTC',
        fromAmount: 10,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('Unknown currency "ZZZ"');

    expect(await db.select().from(trades)).toHaveLength(0);
  });
});
