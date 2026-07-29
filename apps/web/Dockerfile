# syntax=docker/dockerfile:1

FROM node:22.23.1-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

FROM base AS toolchain

RUN npm install --global npm@12.0.1

FROM toolchain AS dependencies

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=@cv-builder/web --include-workspace-root

FROM dependencies AS development

ENV NODE_ENV=development

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=@cv-builder/web", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS builder

ENV NODE_ENV=production

COPY tsconfig.base.json turbo.json ./
COPY apps/web ./apps/web
COPY packages/eslint-config ./packages/eslint-config

RUN mkdir -p apps/web/public \
    && npm run build --workspace=@cv-builder/web

FROM base AS production

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --no-create-home nextjs \
    && mkdir -p /app/apps/web/.next/cache \
    && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

RUN find /app -type f -iname 'README*' -delete

WORKDIR /app/apps/web

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`, { signal: AbortSignal.timeout(4000) }).then((response) => { if (response.status !== 200) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "server.js"]
