# Ghostly Server

The backend for Ghostly, built on Bun with Express and Socket.IO. It handles
sessions, matchmaking, real-time chat relay and abuse reports.

## Tech Stack

- **Runtime**: [Bun](https://bun.com) — executes TypeScript directly, so there is no build step
- **Framework**: [Express 5](https://expressjs.com/)
- **Language**: TypeScript (type checking is a separate step; Bun strips types rather than checking them)
- **Real-time**: [Socket.IO](https://socket.io/) with [@socket.io/redis-adapter](https://socket.io/docs/v4/redis-adapter/), so the server can run more than one instance
- **Database**: [MongoDB](https://www.mongodb.com/) via Mongoose — session and report persistence
- **Redis**: matchmaking queues, match presence, session cache and rate-limit counters
- **Hardening**: `helmet`, `cors`, `express-rate-limit` + `rate-limit-redis`, `xss`

Both MongoDB and Redis are required — `start()` in `src/server.ts` connects to
Redis before the HTTP server begins listening.

## Setup

```bash
cd server
bun install
cp .env.example .env
```

## Development

```bash
bun run dev        # bun --watch src/server.ts
```

The server listens on `http://localhost:5000` by default (`PORT` in `.env`).
Health check:

```bash
curl localhost:5000/health     # {"status":"OK"}
```

`/health` is deliberately outside the `/api/` prefix that the proxies forward,
so it is reachable only on the server's own port — see the note in the root
README before trying to curl it through nginx or Caddy.

## Checks

```bash
bun test --isolate   # unit tests
bun run typecheck    # tsc --noEmit
```

There is no build step. `bun run start` runs the same entry point without watch.

## Layout

- `src/server.ts` — entry point; connects Redis, attaches the Socket.IO adapter, connects Mongo, then listens
- `src/app.ts` — Express app, middleware chain and route mounting
- `src/sockets/` — Socket.IO handlers: auth, matchmaking, chat relay, reports
- `src/services/` — matchmaking, sessions, presence, quota, verification, reports
- `src/routes/`, `src/controllers/` — the HTTP API under `/api`
- `src/models/` — Mongoose schemas
- `src/middlewares/` — session auth, rate limiting, XSS, error handling
- `src/config/` — env, database and Redis wiring
- `src/testing/` — test setup and the in-memory Redis fake

## Security notes

- **Rate limiting**: `express-rate-limit` backed by Redis, so limits hold across instances rather than per process.
- **E2EE relay**: the server brokers the ECDH public key exchange and relays ciphertext. It never sees plaintext — though because it brokers the key exchange, this protects against network eavesdroppers rather than a malicious server.
- **Sessions**: signed tokens; a raw `deviceId` is not a credential.
- **Verification**: gender is classified in the browser and posted as a claim. The server validates the shape against an allowlist and records it — it does not verify it. See the trust model section in `DOCUMENTATION.md`.
