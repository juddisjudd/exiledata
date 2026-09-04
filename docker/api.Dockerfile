# Builds apps/api from the workspace root. Build context must be the repo root, not apps/api —
# the pnpm workspace needs the lockfile and the packages apps/api depends on.
FROM node:24-alpine AS base
RUN npm install -g pnpm@11.25.0

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @exiledata/api... run build
RUN pnpm --filter @exiledata/api --prod --legacy deploy /app

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
EXPOSE 3000
CMD ["node", "dist/server.js"]
