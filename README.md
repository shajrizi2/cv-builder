# CV Builder

A TypeScript monorepo for a fully Dockerized web-based CV builder.

## Repository structure

```text
apps/
  api/           NestJS API placeholder
  web/           Next.js frontend
  worker/        BullMQ worker placeholder
packages/
  database/      Shared Prisma and PostgreSQL package
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

### API Docker image

Use the repository root as the Docker build context. Build the production image with:

```bash
docker build \
  --file apps/api/Dockerfile \
  --target production \
  --tag cv-builder-api:local \
  .
```

Run it on port `3001` with an explicit production CORS allowlist:

```bash
docker run \
  --rm \
  --publish 3001:3001 \
  --env CORS_ORIGINS=http://localhost:3000 \
  cv-builder-api:local
```

The production image runs the compiled NestJS application as a non-root user. It defaults to
`NODE_ENV=production`, `API_HOST=0.0.0.0`, and `API_PORT=3001`. The internal Docker health check
requests `http://127.0.0.1:3001/api/health` and validates the response body.

Swagger remains disabled by default in production. Enable it explicitly when required:

```bash
docker run \
  --rm \
  --publish 3001:3001 \
  --env CORS_ORIGINS=http://localhost:3000 \
  --env SWAGGER_ENABLED=true \
  cv-builder-api:local
```

Build the development target for future bind-mounted development workflows with:

```bash
docker build \
  --file apps/api/Dockerfile \
  --target development \
  --tag cv-builder-api-dev:local \
  .
```

The development target starts the NestJS watcher on `0.0.0.0:3001`. Source mounts and Docker
Compose configuration are intentionally left to later infrastructure tickets. Runtime environment
values should be supplied with Docker's `--env` or `--env-file` options; environment files and
secrets are not copied into the image.

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

### Worker Docker image

Use the repository root as the Docker build context. Build the minimal production worker with:

```bash
docker build \
  --file apps/worker/Dockerfile \
  --target production \
  --tag cv-builder-worker:local \
  .
```

The image runs `node dist/index.js` directly as UID/GID `1001`. It has no HTTP server and exposes
no port. Its health check validates the worker environment, connects to Redis or Valkey, requires
an exact `PONG` response, and closes the health-check connection without modifying queue data.
Supply Redis connection details when the container starts:

```bash
docker run \
  --rm \
  --env NODE_ENV=production \
  --env REDIS_HOST=redis \
  --env REDIS_PORT=6379 \
  cv-builder-worker:local
```

The Redis hostname above must resolve from the container network. Credentials, TLS, database,
concurrency, worker name, and shutdown timeout remain configurable through the variables documented
in `.env.example`; environment files and secrets are not copied into the image.

Build the development target for future bind-mounted workflows with:

```bash
docker build \
  --file apps/worker/Dockerfile \
  --target development \
  --tag cv-builder-worker-dev:local \
  .
```

The development target runs `npm run dev --workspace=@cv-builder/worker` as UID/GID `1001`.
Docker Compose and volume configuration remain intentionally outside this ticket.

An optional browser-capable target adds Debian Chromium and Latin, Arabic, and broad Unicode fonts
without adding those packages to the minimal worker:

```bash
docker build \
  --file apps/worker/Dockerfile \
  --target document-processing \
  --tag cv-builder-worker-document-processing:local \
  .
```

This target keeps the same non-root user, health check, and worker entrypoint. It does not include
Playwright, Puppeteer, OCR, or document-processing jobs. Chromium keeps its sandbox enabled. The
container runtime security profile must permit Chromium to create its sandbox namespaces; prefer a
narrow seccomp profile granting the required namespace operations rather than disabling Chromium's
sandbox.

## Docker Compose application stack

Create optional local overrides from the safe example values:

```bash
cp .env.example .env
```

Compose reads the root `.env` file for interpolation. It is convenient for non-secret local
configuration, but it is not production secret management. Compose maps only reviewed variables
into each service; never put production credentials in this file.

Start the production-like stack in the foreground:

```bash
docker compose up --build
```

Use `--detach` to run it in the background. The stack publishes the web application at
`http://127.0.0.1:3000` and the API at `http://127.0.0.1:3001`. Override the host ports with
`WEB_PORT` and `API_PORT`. Valkey and the worker remain private on the Compose network, and Valkey
stores append-only data in the `valkey-data` volume.

The API accepts the comma-separated `CORS_ORIGINS` allowlist. Swagger is disabled by default; set
`SWAGGER_ENABLED=true` locally to expose `/api/docs`. Keep `WORKER_STOP_GRACE_PERIOD` at least as
long as `WORKER_SHUTDOWN_TIMEOUT_MS`; the defaults are 35 seconds and 30 seconds respectively.

Start development targets with application-specific source mounts:

```bash
docker compose \
  -f compose.yaml \
  -f compose.dev.yaml \
  up --build
```

The override mounts only each application's source, tests, and required configuration files.
Container `node_modules`, web `.next`, and API/worker `dist` remain inside the images, so host
dependencies are never mounted and generated files do not pollute the checkout. Native
Linux/Fedora file watching is used; polling is not enabled.

Useful operating commands:

```bash
docker compose build
docker compose up --detach
docker compose ps
docker compose logs
docker compose logs --follow web
docker compose logs --follow api
docker compose logs --follow worker
docker compose logs --follow valkey
docker compose stop
docker compose down --remove-orphans
docker compose down --volumes --remove-orphans
```

`stop` preserves containers and Valkey data. `down` removes containers and the project network but
preserves the named volume unless `--volumes` is supplied. Application services retry failed
starts at most three times; Valkey uses `unless-stopped` as the persistent local dependency.
After a Valkey restart, BullMQ reconnects and the worker health check returns to healthy once
Valkey is available.

Validate either configuration without starting services:

```bash
docker compose config --quiet
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
```

## PostgreSQL and Prisma

The Compose stack includes PostgreSQL for durable application data. It uses the official
`postgres:18.4-bookworm` image and the named `postgres-data` volume, which Compose resolves as
`cv-builder_postgres-data`. PostgreSQL is private on the application network in the production-like
configuration. The development override publishes it only on
`127.0.0.1:${POSTGRES_PORT:-5432}` so host-side Prisma commands can connect.

The image metadata resolved on 31 July 2026 is:

- Multi-platform OCI index: `sha256:1961f96e6029a02c3812d7cb329a3b03a3ac2bb067058dec17b0f5596aca9296`
- Tested Linux AMD64 manifest: `sha256:16fa100a3a6e92c0556632870455e7f8c6f3df5cefddd67d6b95292732bd7ff0`

Create a local ignored `.env` from `.env.example` if desired, and replace its example-only
password. `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` are required when Compose is
rendered. The official image uses these values only when initializing an empty volume; changing
them later does not rotate credentials in an existing database.

Start PostgreSQL for host-side development:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --detach postgres
```

The `@cv-builder/database` workspace owns the Prisma schema, generated client, and lifecycle
utilities. Prisma Client is generated into an ignored directory and is created lazily: importing
the package does not connect to PostgreSQL. `getDatabaseClient()` reuses a process-global client
during development reloads, while `disconnectDatabase()` explicitly closes it during graceful
application shutdown. API and worker lifecycle wiring is intentionally deferred to a later ticket.

Use these commands from the repository root:

```bash
npm run db:generate
npm run db:format
npm run db:validate
npm run db:migrate:dev -- --name MIGRATION_NAME
npm run db:migrate:status
npm run db:migrate:deploy
```

`db:migrate:dev` is only for creating development migrations. `db:migrate:deploy` is the explicit,
controlled deployment step; application startup never creates or deploys migrations. This ticket
contains no models and no artificial initial migration. Existing migrations must never be edited
after application.

Prisma 7 reads `DATABASE_URL` through `packages/database/prisma.config.ts`. Host commands use
`127.0.0.1` and `POSTGRES_PORT`; a future Compose application will instead need a URL using the
service hostname `postgres` and port `5432`. Percent-encode special characters in URL usernames or
passwords. Never expose either URL or PostgreSQL credentials through `NEXT_PUBLIC_*` variables.

Run package checks independently:

```bash
npm run lint --workspace=@cv-builder/database
npm run typecheck --workspace=@cv-builder/database
npm run test --workspace=@cv-builder/database
npm run build --workspace=@cv-builder/database
```

Ordinary tests do not connect to PostgreSQL. The integration suite is opt-in and requires a
distinct isolated database URL; it never falls back to `DATABASE_URL`:

```bash
RUN_DATABASE_INTEGRATION_TESTS=true \
TEST_DATABASE_URL='postgresql://user:encoded-password@127.0.0.1:5432/cv_builder_test' \
npm run test:integration --workspace=@cv-builder/database
```

No reset command is provided. `docker compose down` retains database data. The destructive command
below permanently removes PostgreSQL and Valkey volumes and must be run only after confirming the
data is disposable:

```bash
docker compose down --volumes --remove-orphans
```

Production deployments must supply secrets through their deployment secret mechanism, keep
PostgreSQL off public networks, back up persistent data, and run `db:migrate:deploy` as a controlled
deployment step rather than as application startup behavior.
