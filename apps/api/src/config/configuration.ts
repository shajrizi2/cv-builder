import { type Environment, validateEnvironment } from './env.schema';

export interface ApplicationConfiguration {
  api: Environment;
}

export function configuration(): ApplicationConfiguration {
  return {
    api: validateEnvironment(process.env),
  };
}
