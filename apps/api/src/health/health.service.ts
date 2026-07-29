import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'api';
}

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}
