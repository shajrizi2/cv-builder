# AGENTS.md

## Project

This repository contains a fully Dockerized web-based CV builder.

The core product features are:

- Create a CV from scratch.
- Upload an existing PDF or DOCX résumé.
- Extract and structure the uploaded content.
- Convert the résumé into editable CV sections.
- Review uncertain extraction results.
- Edit the CV with a live preview.
- Apply professional ATS-friendly templates.
- Export selectable-text PDF files.
- Create job-specific CV versions.
- Improve CV content with controlled AI assistance.

## Architecture

This project uses a TypeScript monorepo.

Expected applications:

- `apps/web`: Next.js frontend
- `apps/api`: NestJS backend API
- `apps/worker`: BullMQ background worker

Expected shared packages:

- `packages/database`
- `packages/shared`
- `packages/validation`
- `packages/resume-schema`
- `packages/templates`

Infrastructure:

- Docker
- Docker Compose
- PostgreSQL
- Prisma
- Redis
- BullMQ
- MinIO or another S3-compatible object storage service
- ClamAV
- Nginx
- Playwright and Chromium for PDF generation

## Development Rules

1. Work only on the requested Jira ticket.
2. Do not implement unrelated future features.
3. Inspect the repository before modifying files.
4. Follow the existing architecture and naming conventions.
5. Use strict TypeScript.
6. Avoid `any` unless clearly justified.
7. Validate external input using Zod or the established validation system.
8. Never expose secrets in frontend code.
9. Never commit secrets or real personal information.
10. Never log CV content, passwords, tokens, or uploaded document contents.
11. Preserve backward compatibility unless the ticket explicitly requires otherwise.
12. Do not silently change public APIs.
13. Keep functions and modules focused.
14. Add or update tests for every implemented behavior.
15. Update relevant documentation when commands or architecture change.
16. Do not begin another Jira ticket after completing the requested ticket.

## Docker Rules

1. The complete application must run through Docker.
2. Use multi-stage Docker builds.
3. Production containers should run as non-root users where practical.
4. Do not store uploaded files permanently inside application containers.
5. Use object storage or persistent volumes for stored files.
6. Add health checks to runtime services.
7. Do not expose PostgreSQL or Redis publicly in production.
8. Pin important base-image versions.
9. Keep production images free of unnecessary development dependencies.
10. Support graceful container shutdown.
11. Keep application containers stateless where practical.
12. Do not include secrets inside Docker images.

## Database Rules

1. Use PostgreSQL.
2. Use Prisma through the shared database package.
3. Every schema change requires a migration.
4. Do not modify an existing migration after it has been applied.
5. User-owned resources must always include authorization checks.
6. Tests must use an isolated test database.
7. Database migrations must run as a controlled deployment step.

## Security and Privacy Rules

1. Uploaded CV files must be private by default.
2. Validate MIME type, file extension, and file signature.
3. Scan uploaded files before processing.
4. Use signed temporary URLs for private document access.
5. Never expose storage credentials to the browser.
6. Verify resource ownership on every protected API operation.
7. Do not trust user-provided file names.
8. Sanitize file names before storage or download.
9. Avoid storing unnecessary personal data.
10. Support permanent user-data deletion.

## Testing Requirements

Before considering a task complete, run the relevant available commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
