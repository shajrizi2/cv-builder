import { Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ResumeExport } from '@cv-builder/resume-schema';
import { ResumeExportsService } from './resume-exports.service';

@Controller()
export class ResumeExportsController {
  constructor(private readonly exportsService: ResumeExportsService) {}

  @Post('resumes/:resumeId/exports')
  create(@Param('resumeId', new ParseUUIDPipe()) resumeId: string): Promise<ResumeExport> {
    return this.exportsService.create(resumeId);
  }

  @Get('resumes/:resumeId/exports/latest')
  latest(@Param('resumeId', new ParseUUIDPipe()) resumeId: string): Promise<ResumeExport | null> {
    return this.exportsService.latestForResume(resumeId);
  }

  @Get('resume-exports/:id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ResumeExport> {
    return this.exportsService.get(id);
  }

  @Get('resume-exports/:id/download')
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.exportsService.download(id);
    void reply
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .send(file.bytes);
  }
}
