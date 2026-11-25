# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f deploy/Dockerfile -t html-preview .

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /src
COPY package.json bun.lock tsconfig.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
RUN bun install --frozen-lockfile
COPY apps apps
COPY packages packages
RUN bun build apps/server/src/index.ts --target bun --outdir /out

FROM oven/bun:1.3.14-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /out/index.js ./index.js
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const host = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000').host; const r = await fetch(`http://127.0.0.1:${process.env.PORT}/healthz`, { headers: { host } }); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "/app/index.js"]
