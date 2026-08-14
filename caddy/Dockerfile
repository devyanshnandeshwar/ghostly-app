# Caddy already terminates TLS and routes /api and /socket.io. Serving the
# built frontend from here too removes the separate nginx container, one
# proxy hop per asset, and a second round of gzip.

FROM node:20-alpine AS builder

WORKDIR /app

COPY shared/package*.json ./shared/
COPY client/package*.json ./client/

WORKDIR /app/client
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund && npm cache clean --force

WORKDIR /app
COPY shared/ ./shared/
COPY client/ ./client/

ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_BASE_PATH=/

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

WORKDIR /app/client
RUN npm run build

# --- Edge router serving the SPA directly ---
FROM caddy:2-alpine

COPY --from=builder /app/client/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
