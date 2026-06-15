# Single image that builds the web bundle and runs the API, which serves both
# the API and the web at one port. Runs TypeScript directly via tsx (the API
# imports @sever/contracts as source), which is fine at this scale.
FROM node:20-alpine

RUN corepack enable
WORKDIR /app

# Install dependencies (workspace-aware) with the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Copy sources and build the web bundle.
COPY . .
RUN pnpm --filter @sever/web build

ENV NODE_ENV=production
ENV PORT=4000
# The API serves apps/web/dist from the same origin.
EXPOSE 4000

CMD ["pnpm", "--filter", "@sever/api", "serve"]
