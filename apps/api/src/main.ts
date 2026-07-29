import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';

import { createApplication } from './application';
import type { ApplicationConfiguration } from './config/configuration';
import type { Environment } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const config = app.get<ConfigService<ApplicationConfiguration, true>>(ConfigService);
  const apiConfig = config.getOrThrow<Environment>('api');

  await app.listen(apiConfig.apiPort, apiConfig.apiHost);
}

void bootstrap();
