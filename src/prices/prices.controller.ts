import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PricesService } from './prices.service.js';

@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get()
  async getPrice(@Query('symbol') symbol?: string) {
    if (!symbol) {
      throw new BadRequestException('symbol query parameter is required');
    }
    return this.pricesService.getPrice(symbol);
  }
}
