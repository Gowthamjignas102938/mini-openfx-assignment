import { Module } from '@nestjs/common';
import { BalancesController } from './balances.controller.js';
import { BalancesService } from './balances.service.js';

@Module({
  controllers: [BalancesController],
  providers: [BalancesService],
})
export class BalancesModule {}