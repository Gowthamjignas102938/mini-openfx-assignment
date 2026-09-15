import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { BalancesService } from './balances.service.js';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get()
  async getAll() {
    return this.balancesService.getAllBalances();
  }

  @Get(':currency')
  async getOne(@Param('currency') currency: string) {
    const balance = await this.balancesService.getBalance(currency);
    if (!balance) {
      throw new NotFoundException(`No balance found for currency "${currency}"`);
    }
    return balance;
  }
}