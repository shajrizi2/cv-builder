import type { NodeEnvironment } from '../config/env.schema.js';

export type LogLevel = 'info' | 'error';

export interface SafeLogContext {
  readonly queueName?: string;
  readonly jobId?: string;
  readonly error?: unknown;
}

export interface Logger {
  info(event: string, context?: SafeLogContext): void;
  error(event: string, context?: SafeLogContext): void;
}

export interface LoggerOutput {
  write(line: string): void;
}

function serializeError(error: unknown): Readonly<Record<string, string>> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }

  return { name: 'UnknownError', message: 'An unknown error occurred' };
}

export function createLogger(
  workerName: string,
  nodeEnvironment: NodeEnvironment,
  output: LoggerOutput = { write: (line) => console.log(line) },
): Logger {
  function log(level: LogLevel, event: string, context: SafeLogContext = {}): void {
    const safeContext = {
      ...(context.queueName === undefined ? {} : { queueName: context.queueName }),
      ...(context.jobId === undefined ? {} : { jobId: context.jobId }),
      ...(context.error === undefined ? {} : { error: serializeError(context.error) }),
    };

    if (nodeEnvironment === 'production') {
      output.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          event,
          workerName,
          ...safeContext,
        }),
      );
      return;
    }

    const details = Object.entries(safeContext)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    output.write(`[${level}] ${workerName} ${event}${details === '' ? '' : ` ${details}`}`);
  }

  return {
    info: (event, context) => log('info', event, context),
    error: (event, context) => log('error', event, context),
  };
}
