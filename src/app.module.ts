import { Module } from '@nestjs/common';
import { RatesModule } from './rates/rates.module.js';
import { PricesModule } from './prices/prices.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
@Module({
  imports: [RatesModule, PricesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
