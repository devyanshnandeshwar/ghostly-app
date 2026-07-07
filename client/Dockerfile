FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy ONLY package files first to maximize Docker layer caching
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/

# 2. Install dependencies with speed optimizations (--no-audit --no-fund)
WORKDIR /app/client
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund && npm cache clean --force

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
RUN npm run build

# --- Serve with Nginx ---
FROM nginx:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
