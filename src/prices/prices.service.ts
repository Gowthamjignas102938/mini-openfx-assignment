import {
  Injectable,
  BadRequestException,
  BadGatewayException,
  Inject,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { TRADEABLE_PAIRS } from '../trades/currency-pairs.js';

@Injectable()
export class PricesService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {}

  async getPrice(symbol: string) {
    const key = `price:${symbol}`;
    const cached = await this.redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const url = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;

    let response;
    try {
      response = await firstValueFrom(this.httpService.get(url));
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw new BadRequestException(
          error.response.data?.msg ?? `Binance rejected symbol "${symbol}"`,
        );
      }
      throw new BadGatewayException('Price source (Binance) is unreachable');
    }

    const bid = Number(response.data.bidPrice);
    const ask = Number(response.data.askPrice);

    if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
      throw new BadGatewayException(
        'Price source (Binance) returned an unexpected response',
      );
    }

    const price = {
      symbol: response.data.symbol,
      bid,
      ask,
      timestamp: Date.now(),
      source: 'binance' as const,
    };

    await this.redisClient.set(key, JSON.stringify(price), 'EX', 15);

    return price;
  }

  async getCachedPriceOnly(symbol: string) {
    const cached = await this.redisClient.get(`price:${symbol}`);
    return cached ? JSON.parse(cached) : null;
  }

  // Reuses getPrice()'s cache-aside logic for each fixed pair — no separate
  // Binance-calling path, so this endpoint is just as cache-friendly (and
  // just as rate-limit-safe) as a manual lookup would be.
  async getTradeablePairs() {
    const prices = await Promise.all(
      TRADEABLE_PAIRS.map((pair) => this.getPrice(pair.symbol)),
    );

    return TRADEABLE_PAIRS.map((pair, i) => ({
      symbol: pair.symbol,
      base: pair.base,
      quote: pair.quote,
      bid: prices[i].bid,
      ask: prices[i].ask,
    }));
  }
}
