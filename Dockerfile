# =============================================================================
# ActorConsole — Multi-stage Dockerfile
# =============================================================================
# Build targets (used by docker-compose):
#   api     — Hono REST API (port 4000)
#   worker  — BullMQ background worker
#   mcp     — MCP server (HTTP mode, port 4100)
#   web     — optional Next.js 15 frontend fallback (port 8080)
# =============================================================================

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache openssl ca-certificates
WORKDIR /app

# =============================================================================
# install — full dependency install + Prisma client generation
# =============================================================================
FROM base AS install
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Copy the full monorepo (excluded: .git, node_modules, .next, dist — see .dockerignore)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY scripts/ ./scripts/

# Install ALL dependencies (dev deps are needed for the build step)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @actorconsole/db generate

# =============================================================================
# Builders — build only the selected deployable and its workspace dependencies.
#
# The web app is deployed to Vercel in production, so the VPS images must not
# require a Next.js build or Vercel-only NEXT_PUBLIC_* values. Keeping separate
# builder stages also makes each Docker target independently cacheable.
# =============================================================================
FROM install AS builder-api
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@actorconsole/api

# Fix extensionless ESM imports — Node.js requires .js extensions in relative imports
COPY scripts/fix-esm-imports.mjs /app/scripts/fix-esm-imports.mjs
RUN node /app/scripts/fix-esm-imports.mjs

FROM install AS builder-worker
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@actorconsole/worker
COPY scripts/fix-esm-imports.mjs /app/scripts/fix-esm-imports.mjs
RUN node /app/scripts/fix-esm-imports.mjs

FROM install AS builder-mcp
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@actorconsole/mcp
COPY scripts/fix-esm-imports.mjs /app/scripts/fix-esm-imports.mjs
RUN node /app/scripts/fix-esm-imports.mjs

# The web target is retained as an optional all-in-one/VPS fallback. It is not
# used by the Vercel deployment; pass NEXT_PUBLIC_API_BASE_URL when building it.
FROM install AS builder-web
ARG API_BASE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV API_BASE_URL=$API_BASE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NODE_ENV=production
RUN pnpm turbo run build --filter=@actorconsole/web
COPY scripts/fix-esm-imports.mjs /app/scripts/fix-esm-imports.mjs
RUN node /app/scripts/fix-esm-imports.mjs

# =============================================================================
# api — Hono REST API
# =============================================================================
FROM base AS api
ENV NODE_ENV=production
COPY --from=builder-api /app/node_modules /app/node_modules
COPY --from=builder-api /app/package.json /app/package.json
COPY --from=builder-api /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder-api /app/scripts /app/scripts
COPY --from=builder-api /app/packages /app/packages
COPY --from=builder-api /app/apps/api /app/apps/api
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

# =============================================================================
# worker — BullMQ background worker
# =============================================================================
FROM base AS worker
ENV NODE_ENV=production
COPY --from=builder-worker /app/node_modules /app/node_modules
COPY --from=builder-worker /app/package.json /app/package.json
COPY --from=builder-worker /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder-worker /app/packages /app/packages
COPY --from=builder-worker /app/apps/worker /app/apps/worker
CMD ["node", "apps/worker/dist/index.js"]

# =============================================================================
# mcp — MCP server (HTTP transport)
# =============================================================================
FROM base AS mcp
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
COPY --from=builder-mcp /app/node_modules /app/node_modules
COPY --from=builder-mcp /app/package.json /app/package.json
COPY --from=builder-mcp /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder-mcp /app/packages /app/packages
COPY --from=builder-mcp /app/apps/mcp /app/apps/mcp
EXPOSE 4100
CMD ["node", "apps/mcp/dist/index.js"]

# =============================================================================
# web — Next.js 15 frontend
# =============================================================================
FROM base AS web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NODE_ENV=production
COPY --from=builder-web /app/node_modules /app/node_modules
COPY --from=builder-web /app/package.json /app/package.json
COPY --from=builder-web /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder-web /app/packages /app/packages
COPY --from=builder-web /app/apps/web /app/apps/web
# Next.js standalone build excludes .next/static (CSS, JS chunks) and public/.
# Copy them into the standalone output so the server can serve them.
COPY --from=builder-web /app/apps/web/.next/static /app/apps/web/.next/standalone/apps/web/.next/static
COPY --from=builder-web /app/apps/web/public /app/apps/web/.next/standalone/apps/web/public
EXPOSE 8080
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
