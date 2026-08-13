# Ghostly

Ghostly is an anonymous chat application that pairs users for real-time conversations based on gender and verification status. It leverages AI for authentic gender verification to ensure a safe and genuine user experience.

## Features

### Anonymous & Secure

- **No Sign-up Required**: Jump straight into chatting without creating an account.
- **End-to-End Encryption**: Messages are encrypted in the browser with an ECDH-derived key; the server relays ciphertext and never sees plaintext. Note that public keys are exchanged through the server and are not yet verified out of band, so this protects against network eavesdroppers rather than a malicious server.
- **Ephemeral Sessions**: Sessions are anonymous and carry no personal details. They are stored server-side so a returning user keeps their nickname and verified status, and expire automatically 30 days after their last activity.

### AI-Powered Gender Verification

- **Real-time Verification**: Uses a Deep Neural Network (DNN) based face detector and gender classification model to verify user gender via webcam.
- **Confidence Threshold**: A gender is only accepted above a configurable model confidence, so low-quality guesses do not grant verified status. There is no liveness check yet, so this does not stop a deliberately uploaded photo.
- **Privacy First**: Images are processed in-memory for verification and immediately discarded; they are never stored.

### Smart Matching System

- **Gender-Based Matching**: Users can choose to match specifically with Male, Female, or Any gender.
- **Verification Required**: Matchmaking is gated on verification — unverified users cannot join the queue at all.
- **Cooldowns**: Prevents spamming and ensures fair usage.
- **Past Match Avoidance**: Once two users have been paired, they are not matched with each other again.

### Real-Time Chat

- **Instant Messaging**: Low-latency communication powered by Socket.IO.
- **Typing Indicators**: See when your match is typing.
- **Connection Status**: Visual indicators for connection health and encryption status.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS v4, Radix UI
- **Backend**: Node.js, Express, Socket.IO (with the Redis adapter, so the server can run more than one instance)
- **Database**: MongoDB (session data), Redis (matchmaking queues, rate limiting, session cache, match presence)
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
| `REPORT_RETENTION_DAYS` | How long abuse reports are kept before a TTL index expires them. Defaults to `365`; set to `0` to keep them indefinitely |

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

## Verifying a Change

```bash
./scripts/verify-local.sh              # rebuild, start, then run every check
./scripts/verify-local.sh --no-build   # against an already-running stack
```

This builds the Docker stack and exercises it end to end: container health and
non-root users, session tokens (including forged and unsigned ones), the admin
API failing closed, upload size limits, and the full socket layer — matchmaking,
ECDH key exchange, ciphertext relay, room authorisation, and queue cleanup.

The socket suites can also be run on their own against a running stack:

```bash
VERIFY_BASE=http://localhost:3000 node server/scripts/verify-e2e.mjs      # 16 checks
VERIFY_BASE=http://localhost:3000 node server/scripts/verify-rematch.mjs  # ~40s
```

`verify-rematch.mjs` is separate because it has to wait out the 30-second match
cooldown to prove two users who just chatted are not immediately paired again.
Set `VERIFY_SLOW=0` to skip it.

Two things no script can check, because they need a human: **webcam verification
with a real face**, and the UI in an actual browser. `TODO.md` keeps the manual
checklist.

---

## Deploying with Docker

The production stack is five services: Caddy (TLS, routing, and serving the
built frontend), the Node server, the Python AI service, MongoDB and Redis.

```bash
./azure_deploy.sh
```

That single command is the whole deploy. The script:

- generates `.env.production` with fresh secrets on first run;
- on later runs, **repairs secrets in place** — if `SESSION_SECRET` is missing or
  still set to a default that exists in git history, it backs the file up and
  rotates it, and generates `ADMIN_TOKEN` if absent. Rerunning changes nothing
  once both are healthy;
- builds and rolls out only the services that changed, so MongoDB and Redis are
  not restarted on every deploy;
- removes the `ghostly-client` container orphaned by the move from nginx to Caddy;
- verifies all five services are actually running afterwards, and exits non-zero
  if any is not.

Rotating `SESSION_SECRET` invalidates every existing session, so users start
fresh. That is unavoidable when the signing key changes.

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
