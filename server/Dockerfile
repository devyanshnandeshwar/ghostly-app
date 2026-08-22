# ---------- dependencies ----------
FROM oven/bun:1-alpine AS deps

WORKDIR /app/server

# Only the manifest and lockfile, so a source change does not bust this layer.
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

# ---------- runtime ----------
FROM oven/bun:1-alpine

WORKDIR /app

COPY --from=deps /app/server/node_modules ./server/node_modules

# shared/ must stay a sibling of server/: tsconfig maps @shared/* to
# ../shared/src/*, and Bun resolves those paths natively -- which is why the
# module-alias shim the Node build needed is gone.
COPY shared/ ./shared/
COPY server/package.json server/tsconfig.json ./server/
COPY server/src/ ./server/src/

# No build step. Bun executes TypeScript directly, so there is no tsc pass and
# no dist/ layout to keep in sync with the entrypoint.

# Drop root: the bun image ships an unprivileged "bun" user.
USER bun

WORKDIR /app/server

EXPOSE 5000

CMD ["bun", "src/server.ts"]
