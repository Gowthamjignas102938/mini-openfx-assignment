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

  it('executes a valid trade converting quote -> base currency (USD -> BTC divides by price)', async () => {
    // Regression test: BTCUSDT's price is "USDT per 1 BTC", so converting
    // USD (the quote side, via the USD->USDT mapping) into BTC (the base
    // side) must divide by the price, not multiply. This test previously
    // asserted the buggy multiplied value (~1000 BTC from 10 USD at price
    // 100) as if it were correct — that assertion was the bug hiding in
    // plain sight, since nothing ever tested the reverse direction to catch
    // the discrepancy.
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
    expect(trade.toAmount).toBe('0.100000');
    expect(await currentAmount('USD')).toBe(990);
    expect(await currentAmount('BTC')).toBeCloseTo(1.1, 6);

    const allTrades = await db.select().from(trades);
    expect(allTrades).toHaveLength(1);
  });

  it('executes a valid trade converting base -> quote currency (BTC -> USD multiplies by price)', async () => {
    // The other half of the same regression: going the opposite direction
    // through the identical symbol must multiply, not divide.
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    const trade = await tradesService.executeTrade({
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      fromAmount: 0.5,
      symbol: 'BTCUSDT',
    });

    expect(trade.fromAmount).toBe('0.500000');
    expect(trade.toAmount).toBe('50.000000');
    expect(await currentAmount('BTC')).toBeCloseTo(0.5, 6);
    expect(await currentAmount('USD')).toBe(1050);

    const allTrades = await db.select().from(trades);
    expect(allTrades).toHaveLength(1);
  });

  it('rejects a trade whose symbol does not match the currency pair', async () => {
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
        toCurrency: 'INR',
        fromAmount: 10,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('Cannot determine trade direction');

    expect(await currentAmount('USD')).toBe(1000);
    expect(await currentAmount('INR')).toBe(500);
    expect(await db.select().from(trades)).toHaveLength(0);
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

  it('two concurrent trades against the same balance: only one succeeds, no lost update', async () => {
    // Regression test for the row-locking fix. Before it, two concurrent
    // transactions could both SELECT the same starting balance, both pass
    // the insufficient-funds check, and both commit — a classic lost
    // update. With SELECT ... FOR UPDATE, the second transaction blocks
    // until the first commits, then re-reads the *already-debited*
    // balance and correctly rejects. USD starts at 1000; two trades each
    // requesting 600 cannot both be affordable (1200 > 1000), so exactly
    // one must succeed.
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 1,
      ask: 1,
      timestamp: Date.now(),
      source: 'binance',
    });

    const attempt = () =>
      tradesService.executeTrade({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        fromAmount: 600,
        symbol: 'BTCUSDT',
      });

    const results = await Promise.allSettled([attempt(), attempt()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain('Insufficient USD balance');

    // Exactly one 600 debit landed — not two (which would go negative),
    // not zero (which would mean the successful one didn't really apply).
    expect(await currentAmount('USD')).toBe(400);
    expect(await db.select().from(trades)).toHaveLength(1);
  });

  it('uses exact decimal arithmetic — no float precision loss on large balances', async () => {
    // Regression test for the Number()-based arithmetic bug. This specific
    // balance/amount pair was empirically confirmed to diverge under plain
    // JS Number arithmetic (100000000000.123456 - 0.000001 naively
    // computes to 100000000000.123459 — wrong by 0.000003) while
    // decimal.js computes the mathematically exact 100000000000.123455.
    await db
      .insert(balances)
      .values({ currency: 'USD', amount: '100000000000.123456' })
      .onConflictDoUpdate({
        target: balances.currency,
        set: { amount: '100000000000.123456', updatedAt: new Date() },
      });

    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 1,
      ask: 1,
      timestamp: Date.now(),
      source: 'binance',
    });

    await tradesService.executeTrade({
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: 0.000001,
      symbol: 'BTCUSDT',
    });

    const [row] = await db.select().from(balances).where(eq(balances.currency, 'USD'));
    expect(row.amount).toBe('100000000000.123455');
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
