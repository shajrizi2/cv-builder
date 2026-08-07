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
COPY packages/database/package.json ./packages/database/package.json
COPY packages/resume-schema/package.json ./packages/resume-schema/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=@cv-builder/worker --include-workspace-root

FROM dependencies AS development

ENV NODE_ENV=development

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home worker \
    && chown -R worker:nodejs /app

COPY --chown=worker:nodejs . .

USER worker

CMD ["npm", "run", "dev", "--workspace=@cv-builder/worker"]

FROM dependencies AS builder

COPY tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages/database ./packages/database
COPY packages/resume-schema ./packages/resume-schema

RUN npm run build --workspace=@cv-builder/resume-schema \
    && npm run build --workspace=@cv-builder/database \
    && npm run build --workspace=@cv-builder/worker \
    && find apps/worker/dist -type f ! -name '*.js' -delete

FROM toolchain AS production-dependencies

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/resume-schema/package.json ./packages/resume-schema/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=@cv-builder/worker --include-workspace-root \
    && node -e "const fs = require('node:fs'); const root = require('./package.json'); const worker = require('./apps/worker/package.json'); const database = require('./packages/database/package.json'); const resume = require('./packages/resume-schema/package.json'); delete root.workspaces; delete root.devDependencies; root.dependencies = { ...worker.dependencies, ...database.dependencies, ...resume.dependencies }; delete root.dependencies['@cv-builder/database']; delete root.dependencies['@cv-builder/resume-schema']; fs.writeFileSync('package.json', JSON.stringify(root));" \
    && npm install --package-lock-only --ignore-scripts --workspaces=false \
    && rm -rf node_modules \
    && npm ci --omit=dev --workspaces=false \
    && npm ls --omit=dev

FROM base AS production

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home worker \
    && mkdir -p /app/apps/worker \
    && chown -R worker:nodejs /app

COPY --from=production-dependencies --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=worker:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=worker:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=worker:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=worker:nodejs /app/packages/resume-schema/package.json ./packages/resume-schema/package.json
COPY --from=builder --chown=worker:nodejs /app/packages/resume-schema/dist ./packages/resume-schema/dist
COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./apps/worker/dist

RUN mkdir -p /app/node_modules/@cv-builder \
    && ln -s ../../packages/database /app/node_modules/@cv-builder/database \
    && ln -s ../../packages/resume-schema /app/node_modules/@cv-builder/resume-schema \
    && chown -h worker:nodejs \
        /app/node_modules/@cv-builder/database \
        /app/node_modules/@cv-builder/resume-schema

WORKDIR /app/apps/worker

USER worker

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "dist/healthcheck.js"]

CMD ["node", "dist/index.js"]

FROM production AS document-processing

USER root

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        chromium \
        chromium-sandbox \
        fontconfig \
        fonts-liberation2 \
        fonts-noto-color-emoji \
        fonts-noto-core \
        fonts-noto-extra \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/tmp

USER worker
