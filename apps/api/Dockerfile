# syntax=docker/dockerfile:1

FROM node:22.23.1-bookworm-slim AS base

WORKDIR /app

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

FROM base AS toolchain

RUN npm install --global npm@12.0.1 \
    && test "$(npm --version)" = "12.0.1"

FROM toolchain AS dependencies

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=@cv-builder/api --include-workspace-root

FROM dependencies AS development

ENV NODE_ENV=development \
    API_HOST=0.0.0.0 \
    API_PORT=3001

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev", "--workspace=@cv-builder/api"]

FROM dependencies AS builder

COPY tsconfig.base.json ./
COPY apps/api ./apps/api

RUN npm run build --workspace=@cv-builder/api \
    && find apps/api/dist -type f ! -name '*.js' -delete

FROM toolchain AS production-dependencies

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=@cv-builder/api --include-workspace-root \
    && node -e "const fs = require('node:fs'); const root = require('./package.json'); const api = require('./apps/api/package.json'); delete root.workspaces; delete root.devDependencies; root.dependencies = api.dependencies; fs.writeFileSync('package.json', JSON.stringify(root));" \
    && rm package-lock.json \
    && npm prune --omit=dev --workspaces=false --package-lock=false \
    && npm ls --omit=dev

FROM base AS production

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home nestjs \
    && mkdir -p /app/apps/api \
    && chown -R nestjs:nodejs /app

COPY --from=production-dependencies --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "const port = process.env.API_PORT || 3001; fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) }).then(async (response) => { if (response.status !== 200) throw new Error('Unexpected status'); const body = await response.json(); if (body.status !== 'ok' || body.service !== 'api') throw new Error('Invalid response'); }).catch(() => process.exit(1));"]

CMD ["node", "dist/main.js"]
