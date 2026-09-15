import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module.js';
import { TradesController } from './trades.controller.js';
import { TradesService } from './trades.service.js';

@Module({
  imports: [PricesModule],
  controllers: [TradesController],
  providers: [TradesService],
})
export class TradesModule {}
