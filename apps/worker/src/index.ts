import { configuration } from './config/configuration.js';
import { createLogger } from './logging/logger.js';
import { WorkerApplication } from './worker.js';

async function bootstrap(): Promise<void> {
  let application: WorkerApplication | undefined;

  try {
    const config = configuration();
    const logger = createLogger(config.workerName, config.nodeEnv);
    application = new WorkerApplication(config, logger);

    const handleSignal = (signal: NodeJS.Signals): void => {
      logger.info(`worker.signal-received.${signal.toLowerCase()}`);
      void application?.shutdown().catch(() => {
        process.exitCode = 1;
      });
    };

    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
    await application.start();
  } catch (error) {
    const fallbackLogger = createLogger('cv-builder-worker', 'production');
    fallbackLogger.error('worker.bootstrap-failed', { error });
    process.exitCode = 1;

    if (application !== undefined) {
      try {
        await application.shutdown();
      } catch {
        process.exitCode = 1;
      }
    }
  }
}

void bootstrap();
