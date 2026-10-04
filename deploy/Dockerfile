# syntax=docker/dockerfile:1
# Official Node LTS image; update this patch version deliberately.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

FROM manifests AS build
RUN npm ci --workspace @oddbid/server --workspace @oddbid/shared --include-workspace-root --no-audit --no-fund
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY tsconfig.base.json ./
# The shared TypeScript package is bundled into the server output by esbuild.
# The web app is deployed separately and is intentionally not built here.
RUN npm run build --workspace @oddbid/server

FROM manifests AS production-dependencies
RUN npm ci --omit=dev --workspace @oddbid/server --workspace @oddbid/shared --include-workspace-root --no-audit --no-fund \
    && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ARG APP_REVISION=unknown
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567 APP_REVISION=${APP_REVISION}
LABEL org.opencontainers.image.title="OddBid game server" \
      org.opencontainers.image.revision="${APP_REVISION}"
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node apps/server/package.json ./apps/server/package.json
COPY --chown=node:node packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD node --input-type=module -e "try { const r = await fetch('http://127.0.0.1:2567/health', { signal: AbortSignal.timeout(3000) }); const h = await r.json(); if (!r.ok || h.ok !== true || h.service !== 'oddbid' || h.revision !== process.env.APP_REVISION) process.exit(1); } catch { process.exit(1); }"
CMD ["node", "apps/server/dist/index.js"]
