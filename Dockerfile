# Node 24 satisfies the project's runtime contract. Pin the multi-architecture image.
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
RUN npm install --global pnpm@11.8.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
ARG VITE_SITE_URL
ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_POSTHOG_KEY=""
ARG VITE_POSTHOG_HOST="https://eu.i.posthog.com"
ARG VITE_SENTRY_DSN=""
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CONVEX_SITE_URL=$VITE_CONVEX_SITE_URL \
    VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SPOTLIGHT_ENABLED=false
RUN pnpm build

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
