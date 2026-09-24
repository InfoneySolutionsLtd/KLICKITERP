FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/server/package.json packages/server/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @klickit/contracts run build \
 && pnpm --filter @klickit/server run build \
 && pnpm --filter @klickit/api run build \
 && pnpm --filter @klickit/worker run build \
 && pnpm --filter @klickit/web run build

FROM base AS api
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /workspace/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/api ./apps/api
CMD ["node", "apps/api/dist/main.api.js"]

FROM base AS worker
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/api ./apps/api
COPY --from=build /workspace/apps/worker ./apps/worker
CMD ["node", "apps/worker/dist/apps/worker/src/main.worker.js"]

FROM base AS web
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web ./apps/web
COPY --from=build /workspace/apps/web/.next ./apps/web/.next
COPY --from=build /workspace/packages/config ./packages/config
COPY --from=build /workspace/packages/contracts ./packages/contracts
WORKDIR /workspace/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3002"]
