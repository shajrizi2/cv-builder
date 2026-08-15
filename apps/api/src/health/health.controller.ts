import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../auth/public.decorator';

import { HealthService, type HealthResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @Public()
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
