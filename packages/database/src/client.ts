import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

type DatabaseGlobal = typeof globalThis & {
  __cvBuilderDatabaseClient?: PrismaClient;
};

export interface CreateDatabaseClientOptions {
  databaseUrl?: string;
}

const databaseGlobal = globalThis as DatabaseGlobal;

function resolveDatabaseUrl(databaseUrl?: string): string {
  const resolvedUrl = databaseUrl ?? process.env.DATABASE_URL;

  if (resolvedUrl === undefined || resolvedUrl.trim() === '') {
    throw new Error('DATABASE_URL is required to create a database client');
  }

  return resolvedUrl;
}

export function createDatabaseClient(options: CreateDatabaseClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: resolveDatabaseUrl(options.databaseUrl),
  });

  return new PrismaClient({ adapter });
}

export function getDatabaseClient(): PrismaClient {
  databaseGlobal.__cvBuilderDatabaseClient ??= createDatabaseClient();

  return databaseGlobal.__cvBuilderDatabaseClient;
}

export async function disconnectDatabase(): Promise<void> {
  const client = databaseGlobal.__cvBuilderDatabaseClient;

  if (client === undefined) {
    return;
  }

  await client.$disconnect();
  delete databaseGlobal.__cvBuilderDatabaseClient;
}
