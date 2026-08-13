# Project Status

## Project

Dockerized Web-Based CV Builder

## Current Phase

MVP core resume workspace

## Current Sprint

Sprint 2 — MVP Core

## Completed

- [x] Created the project directory
- [x] Initialized the Git repository
- [x] Created the `develop` branch
- [x] Created the documentation directories
- [x] Created `AGENTS.md`
- [x] Created `README.md`
- [x] Created `docs/project-status.md`
- [x] CVB-010 — Initialized the TypeScript monorepo foundation
- [x] CVB-011 — Created the Next.js web application
- [x] CVB-012 — Created the NestJS API application
- [x] CVB-013 — Created the BullMQ background worker application
- [x] CVB-014 — Created the Next.js web Dockerfile
- [x] CVB-015 — Created the NestJS API Dockerfile
- [x] CVB-016 — Created the BullMQ worker Dockerfile
- [x] CVB-017 — Created the Docker Compose application stack
- [x] CVB-018 — Created the PostgreSQL and Prisma database foundation
- [x] CVB-020 — Built the resume workspace vertical slice
- [x] CVB-021 — Existing CV upload and AI import
- [x] CVB-022 — Resume templates and PDF export

## In Progress

None

## Blocked

None

## Planned Architecture

- Monorepo
- TypeScript
- Next.js frontend
- NestJS backend API
- BullMQ background worker
- PostgreSQL
- Prisma ORM
- Redis
- MinIO for local object storage
- ClamAV for uploaded-file scanning
- Playwright and Chromium for PDF generation
- Nginx reverse proxy
- Docker and Docker Compose

## Repository Applications

- `apps/web`
- `apps/api` — NestJS API using Fastify
- `apps/worker`

## Shared Packages

- `packages/database`
- `packages/shared`
- `packages/validation`
- `packages/resume-schema`
- `packages/templates`

## Important Decisions

- The complete application will be Dockerized.
- Application containers should remain stateless where practical.
- Uploaded CV files will be private by default.
- Uploaded files will be stored in object storage.
- Document parsing and PDF generation will run in the worker.
- Every Jira ticket will be implemented separately.
- Codex must stop after completing the requested ticket.
- Every ticket will use its own Git branch.
- Large Jira tickets will be divided before implementation.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format
npm run format:check
```

## Next Ticket

Not started

## CVB-020 Delivered Architecture

- `@cv-builder/resume-schema` is the canonical runtime and type contract.
- PostgreSQL stores each validated resume document as JSONB in the `Resume` model.
- NestJS exposes strict CRUD below `/api/resumes`.
- Next.js provides the dashboard, responsive editor, serialized autosave, and live template preview.
- Authentication and OCR remain out of scope.

## CVB-021 Delivered Architecture

- Private PDF/DOCX uploads are validated and stored in MinIO.
- A dedicated BullMQ queue extracts selectable text and maps it into the canonical resume schema.
- Imports recover on dashboard refresh and redirect to the existing editor when complete.
- ClamAV, OCR, authentication, and a production source-file retention policy remain deferred.

## CVB-022 Delivered Architecture

- Resumes persist one of the canonical `classic` or `modern` template IDs; existing rows default to `classic`.
- Web preview and worker PDF generation share the escaped deterministic `@cv-builder/templates` renderer.
- PDF exports persist immutable title/content/template snapshots and asynchronous lifecycle state.
- A dedicated BullMQ queue renders A4 PDFs with system Chromium and stores them privately in MinIO.
- Downloads flow through the API and never expose object keys, bucket details, or storage credentials.
- Authentication/ownership, antivirus, OCR, version history, and automatic export retention/deletion remain deferred.
