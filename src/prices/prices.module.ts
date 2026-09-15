import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedisModule } from '../redis/redis.module.js';
import { PricesController } from './prices.controller.js';
import { PricesService } from './prices.service.js';

@Module({
  imports: [HttpModule, RedisModule],
  controllers: [PricesController],
  providers: [PricesService],
  exports: [PricesService],
})
export class PricesModule {}
