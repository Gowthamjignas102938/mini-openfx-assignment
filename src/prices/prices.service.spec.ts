import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, type AxiosHeaders } from 'axios';
import { PricesService } from './prices.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

function makeAxiosError(response?: { data: unknown }): AxiosError {
  const error = new AxiosError('request failed');
  if (response) {
    error.response = {
      data: response.data,
      status: 400,
      statusText: 'Bad Request',
      headers: {} as AxiosHeaders,
      config: {} as never,
    };
  }
  return error;
}

describe('PricesService', () => {
  let service: PricesService;
  let httpService: { get: jest.Mock<(...args: any[]) => any> };
  let redisClient: {
    get: jest.Mock<(...args: any[]) => any>;
    set: jest.Mock<(...args: any[]) => any>;
  };

  beforeEach(async () => {
    httpService = { get: jest.fn() };
    redisClient = { get: jest.fn(), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        { provide: HttpService, useValue: httpService },
        { provide: REDIS_CLIENT, useValue: redisClient },
      ],
    }).compile();

    service = module.get(PricesService);
  });

  describe('getPrice', () => {
    it('returns the cached value on a hit, without ever calling Binance', async () => {
      redisClient.get.mockResolvedValue(
        JSON.stringify({
          symbol: 'BTCUSDT',
          bid: 100,
          ask: 101,
          timestamp: 1,
          source: 'binance',
        }),
      );

      const result = await service.getPrice('BTCUSDT');

      expect(result.bid).toBe(100);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('fetches from Binance on a cache miss and caches the result with a 15s TTL', async () => {
      redisClient.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(
        of({ data: { symbol: 'BTCUSDT', bidPrice: '100.50', askPrice: '101.50' } }),
      );

      const result = await service.getPrice('BTCUSDT');

      expect(result.bid).toBe(100.5);
      expect(result.ask).toBe(101.5);
      expect(redisClient.set).toHaveBeenCalledWith(
        'price:BTCUSDT',
        expect.any(String),
        'EX',
        15,
      );
    });

    it('maps a Binance rejection (has a response) to a 400 using Binance\'s own message', async () => {
      redisClient.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(
        throwError(() => makeAxiosError({ data: { msg: 'Invalid symbol.' } })),
      );

      await expect(service.getPrice('BOGUS')).rejects.toThrow('Invalid symbol.');
    });

    it('maps a network failure (no response) to a 502', async () => {
      redisClient.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(throwError(() => makeAxiosError()));

      await expect(service.getPrice('BTCUSDT')).rejects.toThrow(
        'Price source (Binance) is unreachable',
      );
    });

    it('maps a malformed response (non-numeric bid/ask) to a 502', async () => {
      redisClient.get.mockResolvedValue(null);
      httpService.get.mockReturnValue(
        of({ data: { symbol: 'BTCUSDT', bidPrice: 'not-a-number', askPrice: '101' } }),
      );

      await expect(service.getPrice('BTCUSDT')).rejects.toThrow(
        'Price source (Binance) returned an unexpected response',
      );
    });
  });

  describe('getCachedPriceOnly', () => {
    it('returns null on a cache miss and never calls Binance', async () => {
      redisClient.get.mockResolvedValue(null);

      const result = await service.getCachedPriceOnly('BTCUSDT');

      expect(result).toBeNull();
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('returns the parsed cached price on a hit', async () => {
      redisClient.get.mockResolvedValue(
        JSON.stringify({
          symbol: 'BTCUSDT',
          bid: 200,
          ask: 201,
          timestamp: 1,
          source: 'binance',
        }),
      );

      const result = await service.getCachedPriceOnly('BTCUSDT');

      expect(result.bid).toBe(200);
    });
  });
});
