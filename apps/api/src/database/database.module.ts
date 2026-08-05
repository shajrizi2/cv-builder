import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { disconnectDatabase, getDatabaseClient, type PrismaClient } from '@cv-builder/database';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  get client(): PrismaClient {
    return getDatabaseClient();
  }

  async onApplicationShutdown(): Promise<void> {
    await disconnectDatabase();
  }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
