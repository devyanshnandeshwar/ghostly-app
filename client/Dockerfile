FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared (needed for @shared alias resolution)
COPY shared/ ./shared/

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci || npm install && npm cache clean --force

COPY client/ .

# Build with sub-path base and production API URLs
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_BASE_PATH=/ghostly

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

RUN npm run build

# --- Serve with Nginx ---
FROM nginx:alpine

COPY --from=builder /app/client/dist /usr/share/nginx/html

COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
