# Multi-stage build for the Next.js web app within the pnpm monorepo.
# Build context is the repo root (see infra/docker-compose.yml: context: ..).

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# Prisma's query engine needs libssl/openssl at build (generate) and runtime;
# node:20-slim (Debian) does not ship it. ca-certificates for outbound TLS.
# ghostscript = print-ready PDF pass (FR-18/19); curl/xz to fetch the Typst binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates ghostscript curl xz-utils \
  && rm -rf /var/lib/apt/lists/*

# Typst (single static binary) — Markdown/structured → PDF renderer (FR-18/20).
ARG TYPST_VERSION=0.12.0
RUN curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ -C /tmp \
  && mv "/tmp/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst \
  && chmod +x /usr/local/bin/typst \
  && rm -rf /tmp/typst-x86_64-unknown-linux-musl

RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @legisnote/web build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@legisnote/web", "start"]
