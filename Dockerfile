# Node 24 satisfies the project's runtime contract. Pin the multi-architecture image.
FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.8.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN chown node:node /app

# Explicit source allowlist shared by the frontend build and operations.
# Tests and tool configs belong to the root TypeScript project.
FROM dependencies AS sources
COPY --chown=node:node src ./src
COPY --chown=node:node convex ./convex
COPY --chown=node:node shared ./shared
COPY --chown=node:node config ./config
COPY --chown=node:node tests ./tests
COPY --chown=node:node scripts/*.mjs scripts/*.d.mts ./scripts/
COPY --chown=node:node *.config.ts knip.ts tsconfig.json convex.json ./

FROM sources AS operations
USER node
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["pnpm", "exec", "convex", "--version"]
CMD ["sleep", "infinity"]

FROM sources AS build
COPY public ./public
ARG VITE_SITE_URL
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_SENTRY_DSN=""
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SPOTLIGHT_ENABLED=false
RUN pnpm build

FROM node:26.13.0-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS production
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
