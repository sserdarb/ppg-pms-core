FROM node:20-alpine

# postgresql-client gives us pg_isready for the boot wait;
# corepack pins pnpm.
RUN apk add --no-cache postgresql-client \
    && corepack enable \
    && corepack prepare pnpm@9.15.4 --activate

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV npm_config_store_dir=/pnpm/store
RUN mkdir -p $PNPM_HOME/store

WORKDIR /app

# Manifests first — better build cache for pnpm install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json* ./packages/shared/

RUN pnpm install --frozen-lockfile || pnpm install

# Source.
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY apps/dashboard/ ./apps/dashboard/

# Build workspace packages, dashboard (Vite static), then API (NestJS).
# Single stage keeps pnpm's hoisted/linked node_modules layout intact —
# multi-stage COPY breaks the symlink graph (postgres, express, etc.
# resolve via packages/<x>/node_modules and apps/api/node_modules
# symlinks that don't survive a fresh COPY).
RUN pnpm --filter @telivityhaip/shared run build
RUN pnpm --filter @telivityhaip/database run build
RUN pnpm --filter dashboard run build
RUN pnpm --filter @telivityhaip/api run build

EXPOSE 3000

# Boot order: wait for Postgres, push schema (idempotent), exec the API.
# Schema push failure is NOT fatal (idempotent re-run on next boot will
# correct any partial state) — but the API is exec'd so a hard crash
# terminates the container and Coolify restarts it. The earlier
# `tail -f /dev/null` debug aid is gone now that runtime logs are clean.
CMD ["sh", "-c", "set +e; \
echo '[boot] waiting for postgres at ${POSTGRES_HOST:-postgres}'; \
until pg_isready -h \"${POSTGRES_HOST:-postgres}\" -U \"${POSTGRES_USER:-haip}\" -d \"${POSTGRES_DB:-haip}\" 2>/dev/null; do sleep 1; done; \
echo '[boot] postgres ready'; \
echo '[boot] pushing schema'; \
node packages/database/dist/push-schema.cjs 2>&1 || echo '[boot] schema-push failed, continuing anyway'; \
echo '[boot] starting api'; \
exec node apps/api/dist/main.js"]
