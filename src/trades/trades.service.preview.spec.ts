/**
 * Unit test: previewTrade() never touches the database (no transaction, no
 * row locks, no writes), so unlike trades.service.spec.ts's real-Postgres
 * integration tests, this only needs a mocked PricesService.
 */
import { jest } from '@jest/globals';
import { TradesService } from './trades.service.js';
import type { PricesService } from '../prices/prices.service.js';

describe('TradesService.previewTrade', () => {
  let pricesService: { getCachedPriceOnly: jest.Mock<(...args: any[]) => any> };
  let tradesService: TradesService;

  beforeEach(() => {
    pricesService = { getCachedPriceOnly: jest.fn() };
    tradesService = new TradesService(pricesService as unknown as PricesService);
  });

  it('previews a quote -> base conversion (USD -> BTC divides by price)', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    const preview = await tradesService.previewTrade({
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: 10,
      symbol: 'BTCUSDT',
    });

    expect(preview).toEqual({
      fromAmount: '10.000000',
      toAmount: '0.100000',
      rate: '100.00000000',
      symbol: 'BTCUSDT',
    });
  });

  it('previews a base -> quote conversion (BTC -> USD multiplies by price)', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    const preview = await tradesService.previewTrade({
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      fromAmount: 0.5,
      symbol: 'BTCUSDT',
    });

    expect(preview.toAmount).toBe('50.000000');
  });

  it('rejects with a 409-style error on a cache miss, the same as executeTrade()', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue(null);

    await expect(
      tradesService.previewTrade({
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        fromAmount: 10,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('No valid cached price');
  });

  it('rejects a symbol that does not match the currency pair, via the shared convertAmount()', async () => {
    pricesService.getCachedPriceOnly.mockResolvedValue({
      symbol: 'BTCUSDT',
      bid: 100,
      ask: 101,
      timestamp: Date.now(),
      source: 'binance',
    });

    await expect(
      tradesService.previewTrade({
        fromCurrency: 'USD',
        toCurrency: 'INR',
        fromAmount: 10,
        symbol: 'BTCUSDT',
      }),
    ).rejects.toThrow('Cannot determine trade direction');
  });
});
