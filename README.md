# CV Builder

A TypeScript monorepo for a fully Dockerized web-based CV builder.

## Repository structure

```text
apps/
  api/           NestJS API placeholder
  web/           Next.js frontend
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

Application and package placeholders remain empty until their corresponding Jira tickets are
implemented.

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

Turborepo orchestrates tasks for each initialized application and package workspace.

## Web application

The Next.js application uses the App Router and is available in `apps/web`.

Start it from the repository root:

```bash
npm run dev --workspace=@cv-builder/web
```

Then open:

- Application: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

Run its validation commands independently:

```bash
npm run lint --workspace=@cv-builder/web
npm run typecheck --workspace=@cv-builder/web
npm run test --workspace=@cv-builder/web
npm run build --workspace=@cv-builder/web
```

The application currently requires no project-specific environment variables. Public and
server-side variables are validated separately in `apps/web/lib/env.ts`; optional public values
must use the `NEXT_PUBLIC_` prefix.
