import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ResumesModule } from './resumes/resumes.module';
import { ResumeImportsModule } from './resume-imports/resume-imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    HealthModule,
    ResumesModule,
    ResumeImportsModule,
  ],
})
export class AppModule {}
