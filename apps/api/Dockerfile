# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @wm/shared build && pnpm --filter @wm/db build && pnpm --filter @wm/api build
# Minimal production node_modules for the api only.
RUN pnpm --filter @wm/api --prod deploy /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /out/package.json ./package.json
COPY --from=build --chown=app:app /repo/apps/api/dist ./dist
# Drizzle migrations ship with the image so the release_command can run them.
COPY --from=build --chown=app:app /repo/packages/db/drizzle ./drizzle
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
