import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PricesModule } from './prices/prices.module.js';
import { BalancesModule } from './balances/balances.module.js';
import { TradesModule } from './trades/trades.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApiKeyGuard } from './common/api-key.guard.js';

@Module({
  imports: [PricesModule, BalancesModule, TradesModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
