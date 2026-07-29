import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns the API health response', () => {
    expect(new HealthService().getHealth()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
