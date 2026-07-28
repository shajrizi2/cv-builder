# CV Builder

A TypeScript monorepo for a fully Dockerized web-based CV builder.

## Repository structure

```text
apps/
  api/           NestJS API placeholder
  web/           Next.js frontend placeholder
  worker/        BullMQ worker placeholder
packages/
  database/      Shared database package placeholder
  eslint-config/ Shared ESLint flat configuration
  resume-schema/ Shared résumé schema package placeholder
  shared/        Shared utilities package placeholder
  templates/     Shared CV templates package placeholder
  validation/    Shared validation package placeholder
infrastructure/
  docker/        Docker configuration placeholder
  nginx/         Nginx configuration placeholder
  scripts/       Infrastructure scripts placeholder
```

The application and package directories are intentionally empty until their corresponding Jira
tickets are implemented.

## Requirements

- Node.js 22.13.0 or newer
- npm 11.0.0 or newer

## Getting started

Install the workspace dependencies:

```bash
npm install
```

## Root commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run format
npm run format:check
```

Turborepo orchestrates application and package tasks. Until those workspaces are initialized, the
build, lint, type-check, and test commands complete without executing package tasks.
