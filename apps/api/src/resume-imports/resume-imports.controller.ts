import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { ResumeImport } from '@cv-builder/resume-schema';
import { ResumeImportsService } from './resume-imports.service';

@Controller('resume-imports')
export class ResumeImportsController {
  constructor(private readonly imports: ResumeImportsService) {}
  @Post() @HttpCode(202) create(@Req() request: FastifyRequest): Promise<ResumeImport> {
    return this.imports.create(request);
  }
  @Get() list(): Promise<ResumeImport[]> {
    return this.imports.list();
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string): Promise<ResumeImport> {
    return this.imports.get(id);
  }
}
