# Project Status

## Project

Dockerized Web-Based CV Builder

## Current Phase

Project setup and repository foundation

## Current Sprint

Sprint 1 — Foundation

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
