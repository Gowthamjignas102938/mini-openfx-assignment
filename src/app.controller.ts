import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './common/public.decorator.js';

@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Health checks and uptime monitors can't send a secret header.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
