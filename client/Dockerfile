FROM oven/bun:1-alpine AS builder

WORKDIR /app

# 1. Copy ONLY package files first to maximize Docker layer caching
COPY shared/package*.json ./shared/
COPY client/package.json client/bun.lock ./client/

# 2. Install dependencies with speed optimizations (--no-audit --no-fund)
WORKDIR /app/client
# Not --production: the build needs devDependencies (vite, typescript).
RUN bun install --frozen-lockfile

# 3. Copy source code after installation so UI code changes don't bust node_modules cache
WORKDIR /app
COPY shared/ ./shared/
COPY client/ ./client/

# 4. Build with sub-path base and production API URLs
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_BASE_PATH=/

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

WORKDIR /app/client
RUN bun run build

# --- Serve with Nginx ---
# Unprivileged variant: runs as the non-root "nginx" user, which cannot bind
# port 80, so the server listens on 8080 instead.
FROM nginxinc/nginx-unprivileged:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
