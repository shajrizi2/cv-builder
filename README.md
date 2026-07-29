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

### Web Docker image

Use the repository root as the Docker build context. Build the standalone production image with:

```bash
docker build \
  --file apps/web/Dockerfile \
  --target production \
  --tag cv-builder-web:local \
  .
```

Run it on port `3000`:

```bash
docker run --rm --publish 3000:3000 cv-builder-web:local
```

The image runs the Next.js standalone server as a non-root user. Its internal Docker health check
requests `http://127.0.0.1:3000/api/health`; inspect the reported state with:

```bash
docker inspect --format='{{json .State.Health}}' <container-name-or-id>
```

Build the development target for future bind-mounted development workflows with:

```bash
docker build \
  --file apps/web/Dockerfile \
  --target development \
  --tag cv-builder-web-dev:local \
  .
```

The development target starts Next.js on `0.0.0.0:3000`. Source mounts and Docker Compose
configuration are intentionally left to later infrastructure tickets.

Server-only environment variables are supplied when the production container runs, for example
with Docker's `--env` or `--env-file` options; environment files are not copied into the image.
`PORT` defaults to `3000`, and the standalone server also respects a runtime override. Public
`NEXT_PUBLIC_*` variables are embedded in browser output by Next.js and therefore must be provided
while building when a non-default value is required. Do not pass secrets through Docker build
arguments.

The application currently requires no project-specific environment variables. Public and
server-side variables are validated separately in `apps/web/lib/env.ts`; optional public values
must use the `NEXT_PUBLIC_` prefix.

## API application

The NestJS API uses Fastify and is available in `apps/api`.

Copy the example environment configuration when local overrides are needed:

```bash
cp .env.example .env
```

Start the API from the repository root:

```bash
npm run dev --workspace=@cv-builder/api
```

The development defaults expose:

- Health check: `http://localhost:3001/api/health`
- Swagger documentation: `http://localhost:3001/api/docs`

Run its validation commands independently:

```bash
npm run lint --workspace=@cv-builder/api
npm run typecheck --workspace=@cv-builder/api
npm run test --workspace=@cv-builder/api
npm run test:e2e --workspace=@cv-builder/api
npm run build --workspace=@cv-builder/api
```

The API validates `NODE_ENV`, `API_PORT`, `API_HOST`, `CORS_ORIGINS`, and
`SWAGGER_ENABLED` before startup. Swagger defaults to enabled outside production and disabled in
production. Production requires an explicit comma-separated CORS origin allowlist; wildcard
origins are rejected. CORS credentials are enabled explicitly and are accepted only for origins in
that validated allowlist.

## Worker application

The BullMQ background worker is available in `apps/worker`. It currently provides the
`system-test` queue foundation; real document-processing jobs are intentionally outside its scope.

Start it from the repository root:

```bash
npm run dev --workspace=@cv-builder/worker
```

The worker validates its Redis connection and lifecycle settings before startup. Local defaults
connect to `127.0.0.1:6379` without authentication. Optional username, password, TLS, database,
concurrency, worker name, and shutdown timeout settings are documented in `.env.example`.

Run its validation commands independently:

```bash
npm run lint --workspace=@cv-builder/worker
npm run typecheck --workspace=@cv-builder/worker
npm run test --workspace=@cv-builder/worker
npm run build --workspace=@cv-builder/worker
```

Unit tests do not require Redis. Run the isolated Redis/Valkey integration test deliberately with:

```bash
RUN_WORKER_INTEGRATION_TESTS=true npm run test:integration --workspace=@cv-builder/worker
```

When explicitly enabled, the integration test fails if Redis or Valkey is unavailable.
