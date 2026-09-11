# Ghostly Server

The backend for Ghostly, built on Bun with Express and Socket.IO. It handles
sessions, matchmaking, real-time chat relay and abuse reports.

## Tech Stack

- **Runtime**: [Bun](https://bun.com) 1.4.1 (pinned in `.bun-version`) — executes TypeScript directly, so there is no build step
- **Framework**: [Express 5](https://expressjs.com/)
- **Language**: TypeScript (type checking is a separate step; Bun strips types rather than checking them)
- **Real-time**: [Socket.IO](https://socket.io/) on the default in-process adapter — this server runs as a **single instance**
- **Database**: [MongoDB](https://www.mongodb.com/) via Mongoose — sessions, reports and the admin audit log
- **Redis**: only what must survive a restart — the filter quota, the socket-connect limiter, the HTTP rate limiters and the `lastActive` throttle. The queue, presence and session cache are in-process
- **Hardening**: `helmet`, `cors`, `compression`, `express-rate-limit` + `rate-limit-redis`, `xss`

Both MongoDB and Redis are required. `start()` in `src/server.ts` connects to
Redis before the HTTP server begins listening, and gives up with a clear error
rather than hanging if Redis is unreachable.

### Do not run more than one instance

The socket layer assumes one process. On a second instance, matched users on
different processes never share a room, and the queue, presence, session cache
and skip cooldowns would each hold a different view. Nothing errors — users
simply cannot reach each other. Going multi-instance means restoring the
Socket.IO Redis adapter and adding Redis-backed implementations behind the
interfaces in `queue.store.ts`, `presence.store.ts` and `match.service.ts`, which
were kept for exactly that. See the comment in `src/sockets/socketManager.ts`.

## Setup

```bash
cd server
bun install
cp .env.example .env
```

Start the datastores from the repository root with `docker compose up -d`. The
variables are documented in `.env.example` and in the root README.

## Development

```bash
bun run dev        # bun --watch src/server.ts
bun run start      # the same entry point, without watch
```

The server listens on `http://localhost:5000` by default (`PORT` in `.env`).

```bash
curl localhost:5000/health     # {"status":"OK"}
```

`/health` does not touch Mongo or Redis, on purpose: it is Render's liveness
probe, and a probe that fails when a dependency blips causes a restart loop.

## Checks

```bash
bun run typecheck       # tsc --noEmit
bun run test            # bun test --isolate
bun run test:coverage   # fails below 80% lines / 78% functions
```

Use `bun run test`, not bare `bun test`. `--isolate` gives each test file its
own module registry; without it a `mock.module` in one file leaks into every
file after it, and the suite passes or fails depending on file order.

Coverage is enforced by `scripts/check-coverage.mjs` rather than `bunfig.toml`,
whose threshold did not actually fail the run.

End-to-end checks against a running server live in `scripts/` — see
"End-to-end checks" in the root README.

## Layout

- `src/server.ts` — entry point; connects Redis, then Mongo, then listens. Drains and exits non-zero on an uncaught exception
- `src/app.ts` — Express app, middleware chain, and route mounting under `/api/v1` (with `/api` as a compatibility alias)
- `src/config/` — env parsing and the production boot guards (`sessionSecret.ts`, `cors.ts`, `datastoreUrls.ts`), Mongo and Redis wiring, product limits
- `src/routes/`, `src/controllers/` — the HTTP API: session, verify, profile, reports, admin
- `src/sockets/` — Socket.IO handshake auth, matchmaking, chat relay and reports; `safeHandler.ts` keeps a malformed payload from crashing the process
- `src/services/` — matchmaking (`match.service`, `queue.store`), presence, sessions, quota, verification, reports, and the age and moderation policies
- `src/models/` — Mongoose schemas: `UserSession`, `Report`, `AuditLog`
- `src/middlewares/` — session and admin auth, rate limiting, XSS sanitisation, error handling
- `src/utils/` — signed session tokens and the logger
- `src/testing/` — test setup and the in-memory Redis fake
- `src/scripts/` — `check-indexes.ts` and a socket stress test
- `scripts/` — the coverage gate and the end-to-end socket suites

## Security notes

- **Sessions**: the server generates the `deviceId` and returns an HMAC-SHA256 signed token. A raw `deviceId` is never a credential. Tokens expire 30 days after issue, and `POST /api/v1/session/logout` revokes one session by bumping its `tokenVersion`.
- **Rate limiting**: HTTP limiters are backed by Redis so they survive a restart, and fail open if Redis errors rather than taking the API down. Sockets get a per-IP connect limit plus per-socket event budgets; persistent abuse disconnects the socket.
- **Input**: HTTP bodies and queries go through the XSS middleware; socket payloads are validated in each handler, and report text is length-capped and sanitised before it reaches Mongo.
- **Admin API**: bearer-token only, and fails closed (503) when `ADMIN_TOKEN` is unset. Every action is written to the audit log.
- **E2EE relay**: the server brokers the ECDH public key exchange and relays ciphertext. It never sees plaintext — though because it brokers the key exchange, this protects against network eavesdroppers rather than a malicious server.
- **Verification**: gender is classified in the browser and posted as a claim. The server validates the shape against an allowlist and records it — it does not verify it. See the trust model in `DOCUMENTATION.md`.
