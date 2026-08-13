# Ghostly

Ghostly is an anonymous chat application that pairs users for real-time conversations based on gender and verification status. It leverages AI for authentic gender verification to ensure a safe and genuine user experience.

## Features

### Anonymous & Secure

- **No Sign-up Required**: Jump straight into chatting without creating an account.
- **End-to-End Encryption**: Messages are encrypted in the browser with an ECDH-derived key; the server relays ciphertext and never sees plaintext. Note that public keys are exchanged through the server and are not yet verified out of band, so this protects against network eavesdroppers rather than a malicious server.
- **Ephemeral Sessions**: User sessions are temporary and data is not persisted after the session ends.

### AI-Powered Gender Verification

- **Real-time Verification**: Uses a Deep Neural Network (DNN) based face detector and gender classification model to verify user gender via webcam.
- **Confidence Threshold**: A gender is only accepted above a configurable model confidence, so low-quality guesses do not grant verified status. There is no liveness check yet, so this does not stop a deliberately uploaded photo.
- **Privacy First**: Images are processed in-memory for verification and immediately discarded; they are never stored.

### Smart Matching System

- **Gender-Based Matching**: Users can choose to match specifically with Male, Female, or Any gender.
- **Priority Queues**: Verified users get priority in matchmaking.
- **Cooldowns**: Prevents spamming and ensures fair usage.
- **Past Match Avoidance**: The system intelligently avoids pairing you with the same person accurately.

### Real-Time Chat

- **Instant Messaging**: Low-latency communication powered by Socket.IO.
- **Typing Indicators**: See when your match is typing.
- **Connection Status**: Visual indicators for connection health and encryption status.

---

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB (session data), Redis (matchmaking queues, rate limiting, presence)
- **AI Service**: Python, FastAPI/Uvicorn, OpenCV, Caffe Model

---

## Running Locally

### Prerequisites

- Node.js v18+
- Python 3.9+
- Docker (used for MongoDB and Redis; both are required)

### 1. Start MongoDB and Redis

Redis is required -- matchmaking queues, rate limiting, session caching and
match presence all live there.

```bash
docker compose -f docker-compose.yml up -d mongo redis
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

`server/.env` is gitignored. The defaults work for local development, but note:

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | Defaults to `mongodb://localhost:27017/ghostly` |
| `REDIS_URL` | Defaults to `redis://localhost:6379` |
| `SESSION_SECRET` | Signs session tokens. Optional locally; **the server refuses to boot in production** if left at the default. Generate with `openssl rand -hex 32` |
| `ADMIN_TOKEN` | Bearer token for `/api/admin/*`. Unset means those routes return 503 (they fail closed) |
| `MIN_VERIFY_CONFIDENCE` | Minimum model confidence to grant verified status. Defaults to `0.85` |

### 3. Configure the client

```bash
cp client/.env.example client/.env
```

### 4. Run the three services

Each in its own terminal, from the repository root:

```bash
# API + Socket.IO on :5000
cd server && npm install && npm run dev

# AI verification service on :8000
cd ai-model
python3 -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# UI on :5173
cd client && npm install && npm run dev
```

Open **http://localhost:5173**.

### Checking it came up

```bash
curl localhost:5000/health     # {"status":"OK"}
curl localhost:8000/health     # {"status":"ok", ...}
```

The server log should show `Redis Connected`, `Socket.IO Redis adapter attached`,
`MongoDB Connected` and `Server running on port 5000`.

---

## Deploying with Docker

The production stack is five services: Caddy (TLS, routing, and serving the
built frontend), the Node server, the Python AI service, MongoDB and Redis.

```bash
./azure_deploy.sh
```

The script generates `.env.production` with fresh secrets on first run, and on
later runs refuses to deploy if `SESSION_SECRET` is missing or left at a known
default. It builds and rolls out only the services that changed, so MongoDB and
Redis are not restarted on every deploy.

To run the production stack manually:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

For a local all-in-Docker run without TLS, `docker-compose.yml` serves the UI
on **http://localhost:3000**.

---

## Contribution

**Contributions are currently NOT accepted.**
This project is currently in a closed development phase. Please do not submit Pull Requests as they will be closed.
