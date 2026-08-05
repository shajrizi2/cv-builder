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
  type UpdateResumeInput,
} from '@cv-builder/resume-schema';

import { ResumeValidationPipe } from './resume-validation.pipe';
import { ResumesService } from './resumes.service';

@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Post()
  create(
    @Body(new ResumeValidationPipe(createResumeInputSchema)) body: CreateResumeInput,
  ): Promise<Resume> {
    return this.resumes.create(body);
  }

  @Get()
  list(): Promise<Resume[]> {
    return this.resumes.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<Resume> {
    return this.resumes.get(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ResumeValidationPipe(updateResumeInputSchema)) body: UpdateResumeInput,
  ): Promise<Resume> {
    return this.resumes.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.resumes.delete(id);
  }
}
