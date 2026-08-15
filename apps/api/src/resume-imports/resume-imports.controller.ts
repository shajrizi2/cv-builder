import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { ResumeImport } from '@cv-builder/resume-schema';
import { ResumeImportsService } from './resume-imports.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('resume-imports')
export class ResumeImportsController {
  constructor(private readonly imports: ResumeImportsService) {}
  @Post() @HttpCode(202) create(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<ResumeImport> {
    return this.imports.create(user.id, request);
  }
  @Get() list(@CurrentUser() user: AuthenticatedUser): Promise<ResumeImport[]> {
    return this.imports.list(user.id);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResumeImport> {
    return this.imports.get(user.id, id);
  }
}
