import { Module } from '@nestjs/common';
import { ResumeImportsController } from './resume-imports.controller';
import { ResumeImportsService } from './resume-imports.service';
@Module({ controllers: [ResumeImportsController], providers: [ResumeImportsService] })
export class ResumeImportsModule {}
