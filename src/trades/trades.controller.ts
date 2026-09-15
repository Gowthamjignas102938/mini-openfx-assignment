import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TradesService } from './trades.service.js';

interface CreateTradeBody {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  symbol: string;
}

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  async createTrade(@Body() body: CreateTradeBody) {
    return this.tradesService.executeTrade(body);
  }

  @Get()
  async getTradeHistory(@Query('limit') limitParam?: string) {
    const parsed = Number(limitParam);
    const limit =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, MAX_HISTORY_LIMIT)
        : DEFAULT_HISTORY_LIMIT;

    return this.tradesService.getTradeHistory(limit);
  }
}
