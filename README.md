# CV Builder

A TypeScript monorepo for a fully Dockerized web-based CV builder.

## Repository structure

```text
apps/
  api/           NestJS API and resume CRUD
  web/           Next.js resume dashboard and editor
  worker/        BullMQ worker placeholder
packages/
  database/      Shared Prisma and PostgreSQL package
  eslint-config/ Shared ESLint flat configuration
  resume-schema/ Canonical runtime-validated résumé domain
  shared/        Shared utilities package placeholder
  templates/     Shared deterministic resume HTML/CSS renderer
  validation/    Shared validation package placeholder
infrastructure/
  docker/        Docker configuration placeholder
  nginx/         Nginx configuration placeholder
  scripts/       Infrastructure scripts placeholder
```

The planned MVP core is complete: authenticated users can create or import private resumes, edit
and preview them, select a template, and generate private PDF exports.

## Requirements

- Node.js 22.13.0 or newer
- npm 11.0.0 or newer

## Getting started

Install the workspace dependencies:

```bash
npm install
```

### Start locally with an external Neon database

The resume workspace can run on the local machine while persisting resumes in Neon. It does not
need the bundled PostgreSQL, Redis, or worker services for this workflow.

Create the ignored root environment file and replace `DATABASE_URL` with the connection string
copied from the Neon dashboard:

```bash
cp .env.example .env
```

Use a pooled Neon connection string for the running API. It should include TLS parameters similar
to `sslmode=require&channel_binding=require`. Quote values containing spaces or shell characters
when the file will be loaded with `source`:

```dotenv
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
API_HOST=0.0.0.0
API_PORT=3001
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_APP_NAME='CV Builder'
NEXT_PUBLIC_API_URL=http://localhost:3001/api
DATABASE_URL='postgresql://USER:PASSWORD@NEON_HOST/neondb?sslmode=require&channel_binding=require'
BETTER_AUTH_SECRET='replace-with-at-least-32-random-characters'
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000
API_JWT_ISSUER=http://localhost:3000
API_JWT_AUDIENCE=cv-builder-api
AUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
```

Load and export the root environment in the terminal before using workspace scripts:

```bash
set -a
source .env
set +a
```

The quotes are required for values such as `CV Builder` and URLs containing `&`; without them,
`source` interprets parts of those values as shell commands.

Apply committed migrations once for a new Neon database, then build the applications:

```bash
npm run db:migrate:deploy
npm run db:migrate:status
npm run build
```

Start the compiled API in the first terminal:

```bash
set -a
source .env
set +a
npm run start --workspace=@cv-builder/api
```

Start the web application in a second terminal:

```bash
npm run start --workspace=@cv-builder/web
```

Open `http://localhost:3000`. The API health endpoint is
`http://localhost:3001/api/health`. Application startup never deploys migrations automatically;
run `db:migrate:deploy` again only when a later change adds a new committed migration.

Both the web auth server and API require the same PostgreSQL database. The complete `compose.yaml`
stack is intended for bundled PostgreSQL and injects its internal URL into both applications. Do
not use that stack unchanged when they should connect to Neon; start the applications as shown
above or run the individual production images with reviewed runtime configuration.

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

The browser calls `NEXT_PUBLIC_API_URL`, which defaults to `http://localhost:3001/api`.
`NEXT_PUBLIC_APP_NAME` defaults to `CV Builder`. Public values are embedded at build time and must
never contain secrets.

### Authentication and private resources

Better Auth `1.6.29` runs in Next.js at `/api/auth/[...all]`. MVP authentication supports
name/email/password signup, email/password signin, database-backed sessions, signout, explicit
trusted origins, and database-backed rate limiting. Better Auth owns credential hashing and
session cookies; the application does not implement password cryptography.

The dashboard and `/resumes/:id` require a server-validated session. The browser derives a
short-lived ES256 JWT from that session and sends it as a bearer token to NestJS. The JWT payload is
limited to `sub`, `iss`, `aud`, `iat`, and `exp`; encrypted signing keys remain in PostgreSQL. Tokens
are cached in memory only and never written to local or session storage. NestJS validates the
signature from Better Auth JWKS plus the exact algorithm, issuer, audience, expiry, and UUID subject.
`GET /api/health` remains anonymous; resume, import, export, and PDF routes are protected.

Required server-only values are `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`BETTER_AUTH_TRUSTED_ORIGINS`, `API_JWT_ISSUER`, `API_JWT_AUDIENCE`, and `AUTH_JWKS_URL` for a
directly started API. Compose supplies the API's internal JWKS URL while preserving the public
issuer. Generate a unique high-entropy `BETTER_AUTH_SECRET` for production and provide it through
the deployment secret mechanism. Never expose it through `NEXT_PUBLIC_*`, build arguments, logs,
or source control.

Every new resume and import records the verified user. Imported resumes inherit the persisted
import owner in the worker. The worker permanently rejects an ownerless legacy import before
reading its object, extracting content, or invoking AI. Export access derives through the owned
resume. Other-user, unknown, and pre-authentication unowned resources return privacy-preserving
not-found responses. PDF downloads use authenticated fetch and a browser Blob, never a bearer-less
link or public MinIO URL.

If a session expires while editing, autosave remains failed/unsaved and the page displays a signin
action without clearing local editor state. Refreshing or navigating away can still lose in-memory
changes; the existing before-unload warning remains the MVP safeguard.

### Resume workspace

The home page is the resume dashboard. Users can create, open, rename, and delete resumes. The
editor at `/resumes/:id` supports personal information, summary, experience, education, skills,
languages, and links, plus ordering and visibility. Its A4-oriented preview updates immediately.
Title and content save together after a 700 ms debounce, with unsaved, saving, saved, and failed
states. Failed saves retain local edits and can be retried.

### Existing CV import

The dashboard accepts text-based PDF and modern DOCX files up to 10 MB. Uploads are private in
MinIO, queued through Valkey, extracted by the standard worker image, mapped with the configured
OpenAI model, validated against the canonical resume schema, and opened in the existing editor.
Scanned/image-only PDFs, OCR, legacy DOC, images, and antivirus scanning are not supported.

Imports require `MINIO_*`, Valkey, `DATABASE_URL`, `OPENAI_API_KEY`, and an explicit
`OPENAI_MODEL` for the worker. Automated tests use fakes and never call OpenAI. The existing
Neon-backed web/API-only startup remains valid for ordinary resume CRUD; imports return a safe
unavailable response until storage and queue configuration are supplied and require the worker to
complete. Apply committed migrations before enabling imports.

Uploaded sources remain private and may be retained after successful import. A production
retention and permanent-deletion policy is unresolved and must be defined before production use.
If queue submission fails, the import is retained as `FAILED` for visibility and deletion of the
private source object is attempted as best-effort compensation.
The API routes are `POST /api/resume-imports`, `GET /api/resume-imports`, and
`GET /api/resume-imports/:id`.

For a manual AI smoke test, set a real `OPENAI_API_KEY` and `OPENAI_MODEL`, start the complete
stack, and upload synthetic PDF and DOCX fixtures containing no real personal data.

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

Resume routes are `POST /api/resumes`, `GET /api/resumes`, `GET /api/resumes/:id`,
`PATCH /api/resumes/:id`, and `DELETE /api/resumes/:id`. UUID parameters and strict request bodies
are validated. Stored JSON and returned resume data are checked against the canonical schema;
missing records consistently return `404`.

All business routes require a valid bearer token. Missing, unowned, and other-user records use the
same not-found behavior. `AUTH_JWKS_URL`, `API_JWT_ISSUER`, and `API_JWT_AUDIENCE` are mandatory in
production.

## Resume schema

`@cv-builder/resume-schema` is the framework-free contract used by the web and API. It exports Zod
schemas, inferred types, section keys, and `createEmptyResumeContent()`. Empty fields remain valid
for in-progress editing, while malformed shapes, IDs, order, visibility, and limits are rejected.

```bash
npm run lint --workspace=@cv-builder/resume-schema
npm run typecheck --workspace=@cv-builder/resume-schema
npm run test --workspace=@cv-builder/resume-schema
npm run build --workspace=@cv-builder/resume-schema
```

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

This target keeps the same non-root user, health check, and worker entrypoint and does not include
OCR. Chromium keeps its sandbox enabled. Docker's default seccomp profile blocks the sandbox's
`clone` and `unshare` namespace operations on the tested Docker 29 runtime, so the repository
includes `docker/chromium-seccomp.json`. It is derived from Moby's `seccomp/v0.2.1` default profile
and adds only those two syscalls; all other default filtering remains active.

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
utilities. The `Resume` model stores validated content as PostgreSQL JSONB with a UUID, title, and
timestamps. Prisma Client is generated into an ignored directory and is created lazily: importing
the package does not connect to PostgreSQL. `getDatabaseClient()` reuses a process-global client
during development reloads, while `disconnectDatabase()` explicitly closes it during graceful
application shutdown. The API closes it during graceful shutdown.

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
controlled deployment step; application startup never creates or deploys migrations. The committed
`20260815180000_add_auth_and_ownership` migration adds Better Auth's user, account, session,
verification, JWKS, and database rate-limit tables plus nullable indexed ownership fields. Those
nullable fields preserve pre-authentication data; application writes always supply an owner and
ordinary queries never expose null-owned rows. Existing migrations must never be edited after they
have been applied.

Inspect legacy unowned rows without reading CV content, filenames, or object keys:

```bash
psql "$DATABASE_URL" --file packages/database/scripts/find-unowned-resources.sql
```

Do not assign or delete legacy rows automatically. Any production cleanup/backfill requires a
separate reviewed data decision. Applying CVB-023 to the real Neon database is a manual controlled
deployment step.

Prisma 7 reads `DATABASE_URL` through `packages/database/prisma.config.ts`. Host commands use
`127.0.0.1` and `POSTGRES_PORT`; Compose supplies the API a URL using the `postgres` service and
port `5432`. Percent-encode special characters in URL usernames or
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

CVB-022 provides the `classic` (default) and `modern` templates plus asynchronous private PDF
export. Template selection is persisted on each resume. Export creation uses
`POST /api/resumes/:resumeId/exports`, status uses `GET /api/resume-exports/:exportId`, and completed
files download through `GET /api/resume-exports/:exportId/download`. The worker consumes the shared
`resume-export` queue in the Chromium-capable `document-processing` image, renders validated
persisted snapshots without remote resources, and stores the resulting PDF privately in MinIO.
The standard `production` worker target remains browser-free.
Compose applies the repository-controlled narrow seccomp profile only to the document worker.
Chromium itself remains sandboxed: the renderer explicitly removes Playwright's `--no-sandbox` and
`--disable-setuid-sandbox` defaults. Deployments must preserve namespace support and must not
replace this profile with `seccomp=unconfined`, broad capabilities, privileged mode, or Chromium
sandbox-disabling flags.

### Production-like release smoke test

Use only disposable volumes, credentials, synthetic users, and synthetic resume content:

1. Copy `.env.example` to an ignored `.env`, replace every placeholder, and generate a disposable
   auth secret of at least 32 random characters.
2. Run `docker compose config --quiet` and build the web, API, standard worker, and
   document-processing worker targets.
3. Start PostgreSQL, Valkey, and MinIO; run `npm run db:migrate:deploy` against that disposable
   database as a separate step; then start application services.
4. Sign up synthetic User A, create/edit/save a resume, change templates, reload it, export a PDF,
   and download it through the authenticated UI.
5. Sign out and confirm protected access fails. Sign up User B and confirm User A's resume, import,
   export status, and PDF are inaccessible.
6. Confirm both health endpoints, private MinIO policy, non-root users, and sandboxed Chromium
   under `docker/chromium-seccomp.json`.
7. Run CV import regressions with fake mapper tests; do not make an external AI call.
8. Stop the stack and remove volumes only after confirming they are the disposable smoke resources.

This repository is release-ready, not automatically deployed. Production domain/TLS, real secret
provisioning, reviewed Neon migration, backups, monitoring, and provider deployment remain operator
responsibilities.

Known MVP limitations: dates are free-form; autosave does not offer multi-client conflict
detection; password reset and email verification have no delivery infrastructure; social login,
MFA, OCR, antivirus scanning, version history, collaboration, teams, billing, additional templates,
and automated retention/deletion remain deferred. A bearer JWT already issued before signout stays
cryptographically valid until its 15-minute expiry; signout removes the database session, prevents
new token issuance, and clears the browser's in-memory token. Imported sources and generated PDFs
may be retained until an explicit deletion policy is implemented.
