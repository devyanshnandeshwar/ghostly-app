FROM node:18-slim

WORKDIR /app

# Copy root shared types first if monorepo? 
# Structure:
# /client
# /server
# /shared -> wait, shared is at root? Yes. `../../shared`
# Ideally we copy shared in.
# But "server" package.json likely references it.
# Let's check if shared is a workspace or just path.
# Assuming standard single-repo copy for simplicity in Docker context.

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/

# Install dependencies (from root to handle workspaces if any, or just recursively)
# Simpler approach: copying full source then installing might be easier for this structure if not strictly hoisted.
# Start fresh in /app
COPY . .

WORKDIR /app/server
RUN npm install
# Also install shared?
# Build
WORKDIR /app/shared
RUN npm install
WORKDIR /app/server
RUN npm run build

# Env
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# User
USER node

CMD ["node", "dist/server/src/server.js"]
