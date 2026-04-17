FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/pdf-af-web/package.json apps/pdf-af-web/package.json
RUN pnpm install --filter pdf-af-web... --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/pdf-af-web/node_modules ./apps/pdf-af-web/node_modules
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/pdf-af-web ./apps/pdf-af-web
RUN pnpm --filter pdf-af-web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
ENV PDF_AF_STORAGE_DIR=/data
COPY --from=builder /app/apps/pdf-af-web/.next/standalone ./
COPY --from=builder /app/apps/pdf-af-web/.next/static ./apps/pdf-af-web/.next/static
COPY --from=builder /app/apps/pdf-af-web/public ./apps/pdf-af-web/public
EXPOSE 3100
CMD ["node", "apps/pdf-af-web/server.js"]
