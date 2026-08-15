import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createResumeInputSchema,
  updateResumeInputSchema,
  type CreateResumeInput,
  type Resume,
  type ResumeImportSource,
  type UpdateResumeInput,
} from '@cv-builder/resume-schema';

import { ResumeValidationPipe } from './resume-validation.pipe';
import { ResumesService } from './resumes.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ResumeValidationPipe(createResumeInputSchema)) body: CreateResumeInput,
  ): Promise<Resume> {
    return this.resumes.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Resume[]> {
    return this.resumes.list(user.id);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Resume> {
    return this.resumes.get(user.id, id);
  }

  @Get(':id/import-source')
  getImportSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ResumeImportSource> {
    return this.resumes.getImportSource(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ResumeValidationPipe(updateResumeInputSchema)) body: UpdateResumeInput,
  ): Promise<Resume> {
    return this.resumes.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.resumes.delete(user.id, id);
  }
}
