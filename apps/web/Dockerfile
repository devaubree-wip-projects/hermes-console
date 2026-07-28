# Production image for the Console web app (apps/web).
# Build context MUST be the monorepo root (Bun workspaces):
#   docker build -f apps/web/Dockerfile -t hermes-console-web .
# infra/prod/compose.console.yaml builds it that way.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /repo
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

FROM deps AS build
COPY apps/web apps/web
COPY packages/shared packages/shared
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build:web

# Runtime: only the standalone server output, no source or node_modules tree.
FROM oven/bun:1.3-alpine AS runtime
# uid/gid 10000 on purpose: it is the uid the Hermes runtime image owns its data
# volume with (mode 700 on each profile). The Console installs its Telegram
# extension into those profiles, so the two images have to agree on the user —
# any other value makes the shared volume unreadable, not merely unwritable.
RUN addgroup -S -g 10000 hermes && adduser -S -u 10000 -G hermes hermes
WORKDIR /app
COPY --from=build --chown=hermes:hermes /repo/apps/web/.next/standalone ./
COPY --from=build --chown=hermes:hermes /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=hermes:hermes /repo/apps/web/public ./apps/web/public
USER hermes
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/healthz').then((r)=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "apps/web/server.js"]
