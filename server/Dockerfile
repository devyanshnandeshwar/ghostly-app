FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared package first (needed for @shared alias)
COPY shared/ ./shared/
COPY server/package*.json ./server/

WORKDIR /app/server
RUN npm ci || npm install && npm cache clean --force

COPY server/ .

# Build shared first, then server
WORKDIR /app/shared
COPY shared/package*.json ./
RUN npm ci || npm install || true

WORKDIR /app/server
RUN npm run build

# --- Production image ---
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./package.json

EXPOSE 5000

CMD ["node", "dist/server/src/server.js"]
