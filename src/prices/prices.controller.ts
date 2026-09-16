import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PricesService } from './prices.service.js';

@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  // Registered before the bare @Get() route so "/prices/pairs" doesn't get
  // swallowed as a ?symbol lookup — Nest matches literal path segments, but
  // keeping the more specific route first also reads clearly for humans.
  @Get('pairs')
  async getTradeablePairs() {
    return this.pricesService.getTradeablePairs();
  }

  @Get()
  async getPrice(@Query('symbol') symbol?: string) {
    if (!symbol) {
      throw new BadRequestException('symbol query parameter is required');
    }
    return this.pricesService.getPrice(symbol);
  }
}
