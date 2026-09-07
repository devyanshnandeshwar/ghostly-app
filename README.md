# Ghostly

Ghostly is an anonymous chat application that pairs users for real-time conversations based on gender and verification status. Gender is classified on the user's own device from a webcam frame that is never uploaded.

## Features

### Anonymous & Secure

- **No Sign-up Required**: Jump straight into chatting without creating an account.
- **End-to-End Encryption**: Messages are encrypted in the browser with an ECDH-derived key; the server relays ciphertext and never sees plaintext. Note that public keys are exchanged through the server and are not yet verified out of band, so this protects against network eavesdroppers rather than a malicious server.
- **Ephemeral Sessions**: Sessions are anonymous and carry no personal details. They are stored server-side so a returning user keeps their nickname and verified status, and expire automatically 30 days after their last activity.

### On-Device Gender Classification

- **Runs in the browser**: MediaPipe's BlazeFace finds the face and gates the capture button until you are well framed; face-api's age/gender net then classifies the crop. Both models are served from this origin, so no third party is contacted.
- **The frame never leaves your device**: only the resulting label and a confidence score are sent to the server. Nothing is uploaded, so there is nothing to store or leak.
- **The server records this claim; it does not verify it.** Classification happens on the client, so a modified client can assert any value: `POST /api/verify/gender {"gender":"female"}` will succeed. The server validates the shape (an allowlist of `male`/`female`, a confidence in range) but cannot check the truth of it. `MIN_VERIFY_CONFIDENCE` still rejects an honest client's uncertain prediction, but it is advisory rather than a control.
- **What this is for**: keeping honest users honest and out of the wrong queue. It is not a defence against anyone who opens devtools, and it is not a liveness check.

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
- **Backend**: Bun, Express, Socket.IO (single instance; queue and presence are in-process)
- **Database**: MongoDB (sessions, reports, audit log), Redis (filter quota and rate-limit counters only)
- **On-device ML**: MediaPipe Tasks Vision (face detection, WASM) and @vladmandic/face-api (gender), both running in the browser

---

## Running Locally

### Prerequisites

- [Bun](https://bun.com) v1.1+ — the server's runtime and the package manager for both JS packages
- Docker (used for MongoDB and Redis; both are required)

Node.js is no longer required. Bun executes the server's TypeScript directly, so
there is no build step, no `dist/` layout and no runtime path-alias shim.

### 1. Start MongoDB and Redis

Redis is required -- matchmaking queues, rate limiting, session caching and
match presence all live there.

```bash
docker compose up -d
```

This now starts only MongoDB and Redis. The server and client run directly on
your machine rather than in containers, so the datastore ports are published
to the host.

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
cd server && bun install && bun run dev

# UI on :5173
cd client && bun install && bun run dev
```

`bun run typecheck` in `server/` runs `tsc --noEmit`. Type checking is now a
separate step from running, because Bun strips types rather than checking them —
so CI must run it explicitly.

Open **http://localhost:5173**.

### Checking it came up

```bash
curl localhost:5000/health     # {"status":"OK"}
```

The server log should show `Redis Connected`, `MongoDB Connected` and
`Server running on port 5000`. There is no Socket.IO Redis adapter any more —
it carried rooms between instances and the deployment runs one.

`/health` is deliberately shallow: it does not touch Mongo or Redis. Render uses
it as a liveness probe, and a probe that fails when a dependency blips causes a
restart loop instead of reporting one.

---

## Verifying a Change

```bash
./scripts/verify-local.sh              # rebuild, start, then run every check
./scripts/verify-local.sh --no-build   # against an already-running stack
```

This builds the Docker stack and exercises it end to end: container health and
non-root users, session tokens (including forged and unsigned ones), the admin
API failing closed, verification claim validation, and the full socket layer — matchmaking,
ECDH key exchange, ciphertext relay, room authorisation, and queue cleanup.

The socket suites can also be run on their own against a running stack:

```bash
VERIFY_BASE=http://localhost:3000 bun server/scripts/verify-e2e.mjs      # 16 checks
VERIFY_BASE=http://localhost:3000 bun server/scripts/verify-rematch.mjs  # ~40s
```

`verify-rematch.mjs` is separate because it has to wait out the 30-second match
cooldown to prove two users who just chatted are not immediately paired again.
Set `VERIFY_SLOW=0` to skip it.

Two things no script can check, because they need a human: **webcam verification
with a real face**, and the UI in an actual browser. `TODO.md` keeps the manual
checklist.

---

## Deploying

Two independent deployments plus two managed datastores, all on free tiers.

| Piece | Where | Notes |
| --- | --- | --- |
| SPA | Vercel | Static Vite build. `client/vercel.json` carries the CSP and security headers. |
| API | Render | Native Bun runtime, `render.yaml`. Free tier spins down after 15 minutes idle. |
| Database | MongoDB Atlas M0 | 512MB, no automated backup — see below. |
| Redis | Upstash | Only quota and rate-limit counters live here. |

### Before the first deploy

**Pin the Bun version.** `server/.bun-version` does this and it is not optional:
Render's native runtime defaults to 1.3.14, which cannot import mongoose at all
(`bson` calls a `v8.startupSnapshot` API Bun did not implement until 1.4). An
unpinned deploy produces a server that never boots, failing with a `bson` stack
trace that names nothing relevant.

**Set the origins.** `CLIENT_URL` on Render must list every origin the SPA is
served from, comma-separated. Cross-origin CORS does not degrade gracefully —
a missing origin means the socket handshake is refused and the app does nothing.

**Replace the CSP placeholder.** `client/vercel.json` has `REPLACE-ME.onrender.com`
in `connect-src`. Until it points at the real API origin, the SPA cannot reach
its own backend.

### What the free tier costs you

Render free **spins down after 15 minutes** without traffic and takes about a
minute to wake. For a product that pairs two strangers this is a real
limitation, not a detail: the queue needs two people online at once, and the
first arrival waits out a cold start on an empty queue. Matching is unreliable
by construction here. Everything else — verification, profiles, reporting —
works normally.

Vercel Hobby includes 100GB/month. The on-device models are ~11.7MB per
uncached visitor, so roughly 8,700 first-time visitors before the project is
paused for the rest of the window. They are now preloaded only once a user
reaches the profile step rather than on arrival. Hobby is also non-commercial
by its own terms.

### Backups

Atlas M0 has **no automated backup and no point-in-time restore**. A nightly
encrypted `mongodump` runs in `.github/workflows/backup.yml` and needs two
repository secrets, `MONGO_URI` and `BACKUP_PASSPHRASE`. Recovery granularity
is one day, bounded further by artifact retention. The restore command is at
the bottom of that file — run it once against a scratch database before
relying on any of it, because a backup that has never been restored is a
hypothesis rather than a backup.

---

## Contribution

**Contributions are currently NOT accepted.**
This project is currently in a closed development phase. Please do not submit Pull Requests as they will be closed.
