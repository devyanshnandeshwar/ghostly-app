# Ghosty Digital Ocean Deployment Guide

This guide details the steps to deploy the Ghosty application to **Digital Ocean App Platform**.

We will use the **Frontend as Gateway** architecture:

- **Frontend (Public)**: Nginx container serving React and proxying API requests.
- **Backend (Internal)**: Node.js server (not exposed directly to internet).
- **AI Service (Internal)**: Python service (not exposed directly).

## 📋 Prerequisites

1.  **GitHub Repository**: Ensure your code is pushed to GitHub (which you have done).
2.  **Digital Ocean Account**: [Sign up/Login](https://cloud.digitalocean.com).
3.  **MongoDB Atlas**: We will continue using MongoDB Atlas for the database.
4.  **Redis**: We will create a Managed Redis in Digital Ocean.

---

## ☁️ Step 1: Create Infrastructure

### 1. Create Redis

1.  Go to Digital Ocean Dashboard -> **Databases**.
2.  Click **Create Database Cluster**.
3.  Select **Redis**.
4.  Choose a datacenter (e.g., Bangalore or Singapore).
5.  Choose the cheapest node plan ($15/mo) for production or dev.
6.  Click **Create Database Cluster**.
7.  **IMPORTANT**: Once created, go to "Connection Details" and switch to "Private Network" (VPC) if possible, or use "Public Network" with "Trusted Sources" limited to your App Platform later. For now, copy the **Public Connection String** (format: `rediss://default:password@host:port`).

### 2. Prepare MongoDB Atlas

- Ensure you have your **MongoDB Connection String** ready (from the previous guide).
- Ensure "Network Access" in Atlas allows `0.0.0.0/0` (Allow All) because Digital Ocean App Platform uses dynamic IPs (unless you set up static outbound IPs, which is advanced).

---

## 🚀 Step 2: Create App in App Platform

1.  Go to **Apps** -> **Create App**.
2.  **Service Provider**: Select **GitHub**.
3.  **Repository**: Select `devyanshnandeshwar/ghostly-app`.
4.  **Branch**: `main`.
5.  **Source Directory**: `/` (Root).
6.  Click **Next**.

DO will try to auto-detect resources. It might get it wrong for a monorepo. We will configure manually via "Resources".

---

## 🛠️ Step 3: Configure Components

We need to edit the detected resources or add them manually to match our architecture.

### Component 1: Server (Backend)

- **Type**: **Worker** or **Internal Service**?
  - Since Nginx will proxy to it via HTTP, strictly speaking, it should be an **Internal Service**.
  - _Edit resource_:
  - **Name**: `server`
  - **Type**: **Internal Service** (Check "Internal routing only" or equivalent, typically just "Web Service" but don't add public routes later, OR strictly "Internal Service" depends on DO UI updates. Let's assume **Web Service** but we won't expose it to root).
  - **Docker**:
    - **Dockerfile Path**: `server/Dockerfile`
    - **Context**: `.` (Root) - _Crucial for shared files_.
  - **HTTP Port**: `5000`
  - **Environment Variables**:
    - `MONGO_URI`: `mongodb+srv://...`
    - `REDIS_URI`: `rediss://...` (from Step 1)
    - `AI_SERVICE_URL`: `http://ai-model:8000`
    - `CLIENT_URL`: `https://devyansh.tech/ghosty`
    - `NODE_ENV`: `production`

### Component 2: AI Model

- **Type**: **Internal Service** (or Web Service not exposed).
- **Name**: `ai-model`
- **Docker**:
  - **Dockerfile Path**: `ai-model/Dockerfile`
  - **Context**: `ai-model` (or `.` if it needs root, but likely safe with subdir).
- **HTTP Port**: `8000`

### Component 3: Client (Frontend & Gateway)

- **Type**: **Web Service** (Public).
- **Name**: `client`
- **Docker**:
  - **Dockerfile Path**: `client/Dockerfile`
  - **Context**: `.` (Root).
- **HTTP Port**: `80`
- **Routes**:
  - Add Route: `/` (or specifically `/ghosty`?)
  - Digital Ocean maps the component to root by default.
  - Since our app serves under `/ghosty`, we want traffic to hit this container.
  - **Crucial Config**: Nginx needs to find `server` and `ai-model`.
  - **Internal Networking**: In DO App Platform, components are accessible at their name.
    - We named backend `server`. Nginx config uses `http://server:5000`. This matches!
  - **Environment Variables**:
    - `VITE_BASE_PATH`: `/ghosty` (Build time arg, usually auto-detected from Dockerfile ARG, but safer to add here).

---

## 🔗 Step 4: Routing & Domain

1.  **Domain**: Add `devyansh.tech`.
2.  **CNAME**: You will need to duplicate the DO App URL to your DNS provider.
3.  **Path Routing**:
    - In DO App Platform Settings, ensure the `client` component handles requests.
    - Since `client` runs Nginx which handles `/ghosty`, `/ghosty/api`, and `/socket.io`, it should be the **default component** or mapped to `/`.

---

## 📝 Nginx Proxy Update (Important)

For Digital Ocean Internal DNS to work specifically as `http://server:5000`, we need to ensure the service discovery name matches.

- If you named the component `backend` instead of `server`, you must update `client/nginx.conf` to `proxy_pass http://backend:5000`.
- **Action**: Ensure you strictly name the DO component `server` during setup.

---

## ✅ Deployment Checklist

1.  **Build**: Watch the build logs. Ensure Dockerfiles build successfully.
2.  **Environment**: Double check `MONGO_URI` and `REDIS_URI`.
    - _Note_: For DO Managed Redis, use the **Private Network** connection string if App Platform is in the same VPC, otherwise Public (with TLS `rediss://`).
3.  **Verify**:
    - Go to `https://devyansh.tech/ghosty`
    - Open Console. Check WebSocket connection `wss://devyansh.tech/socket.io`.
    - If WebSocket fails:
      - Digital Ocean App Platform supports WebSockets natively.
      - Ensure Nginx config has the `Upgrade` headers (we added them).

## 🛠 Troubleshooting

- **502 Bad Gateway**: Usually means Nginx can't reach `server:5000`. Check if `server` component is healthy.
- **CORS Errors**: Check `CLIENT_URL` env var on Backend.
- **Redis Connection Error**: Ensure you used `rediss://` (TLS) if strictly required by DO Managed Redis (it usually is).
