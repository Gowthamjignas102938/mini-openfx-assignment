import { Body, Controller, Post } from '@nestjs/common';
import { TradesService } from './trades.service.js';

interface CreateTradeBody {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  symbol: string;
}

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Post()
  async createTrade(@Body() body: CreateTradeBody) {
    return this.tradesService.executeTrade(body);
  }
}
