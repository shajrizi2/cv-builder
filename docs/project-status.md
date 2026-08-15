# Project Status

## Project

Dockerized Web-Based CV Builder

## Current Phase

Planned MVP core complete — release-ready repository

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
- [x] CVB-023 — Authentication, resource ownership, and MVP release validation
- [x] CVB-024 — AI-optional CV import fallback

## In Progress

None

## Blocked

None

## MVP Complete

- Authenticated resume workspace
- Existing PDF/DOCX CV import
- Classic and Modern resume templates
- Asynchronous private PDF export
- Better Auth email/password sessions
- Cryptographically verified API JWT/JWKS boundary
- Per-user resume, import, export, and download ownership
- Docker/Compose release validation

## Deferred/Post-MVP

- CVB-019 shared validation
- OCR and scanned CV support
- Antivirus/ClamAV
- Automated source/export retention and deletion
- Version history and collaboration
- Teams, organizations, and billing
- Advanced AI editing, ATS scoring, and cover letters
- Additional templates
- Social authentication and MFA
- Password-reset and verification email infrastructure
- CI/CD and provider-specific public-cloud deployment

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

No additional MVP ticket is planned. CVB-019 remains deferred.

## CVB-020 Delivered Architecture

- `@cv-builder/resume-schema` is the canonical runtime and type contract.
- PostgreSQL stores each validated resume document as JSONB in the `Resume` model.
- NestJS exposes strict CRUD below `/api/resumes`.
- Next.js provides the dashboard, responsive editor, serialized autosave, and live template preview.
- Authentication is delivered by CVB-023; OCR remains deferred.

## CVB-021 Delivered Architecture

- Private PDF/DOCX uploads are validated and stored in MinIO.
- A dedicated BullMQ queue extracts selectable text and maps it into the canonical resume schema.
- Imports recover on dashboard refresh and redirect to the existing editor when complete.
- ClamAV, OCR, and a production source-file retention policy remain deferred.

## CVB-022 Delivered Architecture

- Resumes persist one of the canonical `classic` or `modern` template IDs; existing rows default to `classic`.
- Web preview and worker PDF generation share the escaped deterministic `@cv-builder/templates` renderer.
- PDF exports persist immutable title/content/template snapshots and asynchronous lifecycle state.
- A dedicated BullMQ queue renders A4 PDFs with system Chromium and stores them privately in MinIO.
- Downloads flow through the API and never expose object keys, bucket details, or storage credentials.
- Antivirus, OCR, version history, and automatic export retention/deletion remain deferred.

## CVB-023 Delivered Architecture

- Better Auth runs in Next.js with email/password credentials, PostgreSQL sessions, explicit
  trusted origins, database-backed rate limiting, minimal-claim ES256 JWTs, and encrypted JWKS
  private-key storage.
- NestJS globally protects business routes and independently verifies algorithm, signature,
  issuer, audience, expiry, and UUID subject; health remains anonymous.
- Resume and ResumeImport store nullable migration-compatible owners. All new writes require an
  authenticated owner, and ordinary APIs exclude legacy null-owned rows.
- Import workers derive ownership from persisted imports and reject ownerless imports before any
  document access or AI call; export and authenticated PDF download authorization derive through
  the owned resume.
- API JWTs remain in browser memory only. PDF bytes use authenticated fetch; private MinIO
  identifiers are never exposed.
- CVB-023 adds one non-destructive Prisma migration and a read-only legacy ownership audit query.
- The repository is release-ready but is not claimed to be publicly deployed. Production secret,
  domain/trusted-origin configuration, Neon migration deployment, and hosting remain manual.

## CVB-024 Delivered Architecture

- Local PDF/DOCX extraction is the import success boundary; missing or failed AI mapping now creates
  a valid owned manual draft instead of failing an otherwise usable import.
- `ResumeImport` records `AI_MAPPED` or `MANUAL_FALLBACK` separately from its existing lifecycle.
  Extracted text is capped at 100,000 characters, retained only for manual fallback, and returned
  only by the owner-scoped editor source endpoint.
- Original source objects are deleted best-effort only after durable extraction. Persisted text is
  reused on infrastructure retry, and completed imports remain idempotent.
- Both OpenAI key/model values absent is supported; both present enables AI; partial configuration
  fails worker validation. No feature flag is required.
- The CVB-024 Prisma migration is committed but deployment to real Neon remains a controlled manual
  action. Automatic reconciliation of rare source-object cleanup failures remains deferred.
