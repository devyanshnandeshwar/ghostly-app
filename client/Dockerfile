# Stage 1: Build
FROM node:18-alpine as builder

WORKDIR /app

# Copy shared module (needed for dependencies)
COPY shared/package*.json ./shared/

# Copy client package files
COPY client/package*.json ./client/

# Install dependencies
WORKDIR /app/client
RUN npm install

# Copy source code
WORKDIR /app
COPY shared/ ./shared/
COPY client/ ./client/

# Build argument for base path (needed for /ghosty subpath)
ARG VITE_BASE_PATH=/ghosty
ENV VITE_BASE_PATH=$VITE_BASE_PATH

WORKDIR /app/client
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
