FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy ONLY package files first to maximize Docker layer caching
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/

# 2. Install dependencies with speed optimizations (--no-audit --no-fund)
WORKDIR /app/shared
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund || true

WORKDIR /app/server
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund && npm cache clean --force

# 3. Copy source code after installation so code changes don't bust node_modules cache
WORKDIR /app
COPY shared/ ./shared/
COPY server/ ./server/

# 4. Build shared first, then server
WORKDIR /app/server
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

# --- Production image ---
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./package.json

EXPOSE 5000

CMD ["node", "dist/server/src/server.js"]
