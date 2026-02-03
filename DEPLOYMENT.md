# Ghosty Production Deployment Guide

This guide details the steps to deploy the Ghosty application to production using **Fly.io**, **Docker**, **MongoDB Atlas**, and **Redis**.

## 🏗️ Architecture

- **Frontend**: React (Vite) serving static assets via Nginx Container. Nginx also acts as a reverse proxy for `/ghosty/api` and `/socket.io`.
- **Backend**: Node.js API & Socket.IO.
- **AI Service**: Python FastAPI (Internal Service).
- **Database**: MongoDB Atlas (Cloud).
- **Cache/Queue**: Fly Redis (or external Redis).
- **Routing**: Custom domain `devyansh.tech/ghosty`.

---

## ⚙️ Part 1: Prerequisites & Local Preparation

### 1. Install Tools

Ensure you have the following CLIs installed:

- **Fly CLI**: `curl -L https://fly.io/install.sh | sh`
- **Docker**: [Install Docker Desktop](https://www.docker.com/products/docker-desktop)

### 2. Login to Fly.io

```bash
fly auth login
```

### 3. Verify Local Production Build

We have created a `docker-compose.prod.yml` to simulate the production environment locally.

```bash
docker-compose -f docker-compose.prod.yml up --build
```

> Verify the app works at `http://localhost/ghosty`. Note: This uses local Mongo/Redis containers, not cloud ones yet.

---

## 🌐 Part 2: Database Setup (MongoDB Atlas)

1.  **Create Cluster**: Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free MO cluster.
2.  **Create User**: In "Database Access", create a user (e.g., `ghosty_user`) with read/write access. **Save the password**.
3.  **Network Access**: In "Network Access", allow access from anywhere (`0.0.0.0/0`) temporarily for Fly.io dynamic IPs.
4.  **Get Connection String**:
    - Click "Connect" -> "Drivers" -> "Node.js".
    - Copy the string: `mongodb+srv://ghosty_user:<password>@cluster0.p8q8a.mongodb.net/ghostly?retryWrites=true&w=majority`

---

## ⚡ Part 3: Redis Setup

We recommend using **Fly Redis** for low latency within the same network.

### Option A: Fly Redis (Recommended)

Run this in your terminal:

```bash
fly redis create
```

- **Region**: Choose the same region as your apps (e.g., `sin` Singapore or `blr` Bangalore).
- **Save the Upstash Redis URL** provided (starts with `redis://:...`).

---

## ☁️ Part 4: Fly.io App Creation

We will deploy 3 separate apps combined via internal networking.

### 1. Create Backend App

```bash
cd server
fly launch --no-deploy --name ghosty-backend
```

- **Tweak Settings**: Yes.
- **Region**: Same as Redis.
- **Database**: No (we have Atlas).
- **Redis**: No (we created it).

**Edit `fly.toml` in `server/`:**
Ensure `internal_port` is 5000 and expose it internally.

### 2. Create AI Service App

```bash
cd ../ai-model
fly launch --no-deploy --name ghosty-ai
```

- **Internal Only**: We do not want this exposed to the public internet. Remove `[[services]]` block in `fly.toml` to make it internal-only.

### 3. Create Frontend App

```bash
cd ../client
fly launch --no-deploy --name ghosty-frontend --build-target production
```

- **Public**: This is the entry point. It will listen on 80/443.

---

## 🔐 Part 5: Environment Config

Set secrets on Fly.io.

### Backend Secrets

```bash
fly secrets set MONGO_URI="mongodb+srv://..." -a ghosty-backend
fly secrets set REDIS_URI="redis://default:password@fly-ghosty-redis.upstash.io" -a ghosty-backend
fly secrets set JWT_SECRET="your_production_secret" -a ghosty-backend
fly secrets set CLIENT_URL="https://devyansh.tech/ghosty" -a ghosty-backend
fly secrets set AI_SERVICE_URL="http://ghosty-ai.internal:8000" -a ghosty-backend
```

> Note: `ghosty-ai.internal` works because Fly apps can talk via internal DNS.

### Client Secrets (Build Args for Vite)

Fly handles build args differently. You might need to use `[build.args]` in `fly.toml` or multi-stage build secrets.
However, Nginx is static. We need to bake vars.
For `VITE_BASE_PATH`, it is set in Dockerfile.

---

## 🚀 Part 6: Deployment

### 1. Deploy AI Service

```bash
cd ai-model
fly deploy -a ghosty-ai
```

### 2. Deploy Backend

```bash
cd server
fly deploy -a ghosty-backend
```

### 3. Deploy Frontend

```bash
cd client
fly deploy -a ghosty-frontend
```

---

## 🔀 Part 7: Domain & Routing

To serve under `devyansh.tech/ghosty`:

1.  **Certificates**:
    ```bash
    fly certs add devyansh.tech -a ghosty-frontend
    ```
2.  **DNS Records**:
    - Add the `A` and `AAAA` records shown by `fly certs show` to your DNS provider (e.g., GoDaddy, Cloudflare).
3.  **Verify**:
    ```bash
    fly certs check devyansh.tech -a ghosty-frontend
    ```

🎉 **Done!** Access `https://devyansh.tech/ghosty`.
