import { z } from 'zod';

const text = z.string().max(10_000);
const shortText = z.string().max(300);
const id = z.string().uuid();
const resumeTitleSchema = z.string().trim().min(1, { message: 'Title is required' }).max(200);

export const resumeSectionKeys = [
  'personalInfo',
  'summary',
  'experience',
  'education',
  'skills',
  'languages',
  'links',
] as const;

export const resumeSectionKeySchema = z.enum(resumeSectionKeys);

const personalInfoSchema = z
  .object({
    fullName: shortText,
    email: shortText,
    phone: shortText,
    location: shortText,
  })
  .strict();

const experienceSchema = z
  .object({
    id,
    company: shortText,
    position: shortText,
    location: shortText,
    startDate: shortText,
    endDate: shortText,
    current: z.boolean(),
    description: text,
  })
  .strict();

const educationSchema = z
  .object({
    id,
    institution: shortText,
    qualification: shortText,
    field: shortText,
    startDate: shortText,
    endDate: shortText,
    description: text,
  })
  .strict();

const skillSchema = z.object({ id, name: shortText, level: shortText }).strict();
const languageSchema = z.object({ id, name: shortText, proficiency: shortText }).strict();
const linkSchema = z.object({ id, label: shortText, url: text }).strict();

export const resumeContentSchema = z
  .object({
    metadata: z.object({ version: z.literal(1) }).strict(),
    personalInfo: personalInfoSchema,
    summary: text,
    experience: z.array(experienceSchema).max(100),
    education: z.array(educationSchema).max(100),
    skills: z.array(skillSchema).max(200),
    languages: z.array(languageSchema).max(100),
    links: z.array(linkSchema).max(100),
    sectionOrder: z
      .array(resumeSectionKeySchema)
      .length(resumeSectionKeys.length)
      .refine((value) => new Set(value).size === resumeSectionKeys.length, {
        message: 'Section order must contain every section exactly once',
      }),
    sectionVisibility: z.record(resumeSectionKeySchema, z.boolean()),
  })
  .strict();

export const resumeSchema = z
  .object({
    id: id,
    title: resumeTitleSchema,
    content: resumeContentSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const createResumeInputSchema = z.object({ title: resumeTitleSchema }).strict();
export const updateResumeInputSchema = z
  .object({
    title: resumeTitleSchema.optional(),
    content: resumeContentSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: 'At least one field must be provided',
  });

export type ResumeSectionKey = z.infer<typeof resumeSectionKeySchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type Resume = z.infer<typeof resumeSchema>;
export type CreateResumeInput = z.infer<typeof createResumeInputSchema>;
export type UpdateResumeInput = z.infer<typeof updateResumeInputSchema>;
export type Experience = ResumeContent['experience'][number];
export type Education = ResumeContent['education'][number];
export type Skill = ResumeContent['skills'][number];
export type Language = ResumeContent['languages'][number];
export type ResumeLink = ResumeContent['links'][number];

export function createEmptyResumeContent(): ResumeContent {
  return {
    metadata: { version: 1 },
    personalInfo: { fullName: '', email: '', phone: '', location: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    languages: [],
    links: [],
    sectionOrder: [...resumeSectionKeys],
    sectionVisibility: Object.fromEntries(resumeSectionKeys.map((key) => [key, true])) as Record<
      ResumeSectionKey,
      boolean
    >,
  };
}
