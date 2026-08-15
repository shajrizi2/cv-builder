import { Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ResumeExport } from '@cv-builder/resume-schema';
import { ResumeExportsService } from './resume-exports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller()
export class ResumeExportsController {
  constructor(private readonly exportsService: ResumeExportsService) {}

  @Post('resumes/:resumeId/exports')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resumeId', new ParseUUIDPipe()) resumeId: string,
  ): Promise<ResumeExport> {
    return this.exportsService.create(user.id, resumeId);
  }

  @Get('resumes/:resumeId/exports/latest')
  latest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resumeId', new ParseUUIDPipe()) resumeId: string,
  ): Promise<ResumeExport | null> {
    return this.exportsService.latestForResume(user.id, resumeId);
  }

  @Get('resume-exports/:id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResumeExport> {
    return this.exportsService.get(user.id, id);
  }

  @Get('resume-exports/:id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.exportsService.download(user.id, id);
    void reply
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      )
      .send(file.bytes);
  }
}
