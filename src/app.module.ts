import { Module } from '@nestjs/common';
import { PricesModule } from './prices/prices.module.js';
import { BalancesModule } from './balances/balances.module.js';
import { TradesModule } from './trades/trades.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
@Module({
  imports: [PricesModule, BalancesModule, TradesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
