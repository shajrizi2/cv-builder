import { Module } from '@nestjs/common';
import { ResumeExportsController } from './resume-exports.controller';
import { ResumeExportsService } from './resume-exports.service';

@Module({ controllers: [ResumeExportsController], providers: [ResumeExportsService] })
export class ResumeExportsModule {}
