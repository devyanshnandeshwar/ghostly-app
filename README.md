# Ghostly

Ghostly is an anonymous chat application that pairs users for real-time conversations based on gender and verification status. Gender is classified on the user's own device from a webcam frame that is never uploaded.

## Features

### Anonymous & Secure

- **No Sign-up Required**: Jump straight into chatting without creating an account.
- **End-to-End Encryption**: Messages are encrypted in the browser with an ECDH-derived key; the server relays ciphertext and never sees plaintext. Note that public keys are exchanged through the server and are not yet verified out of band, so this protects against network eavesdroppers rather than a malicious server.
- **Ephemeral Sessions**: Sessions are anonymous and carry no personal details. They are stored server-side so a returning user keeps their nickname and verified status, and expire automatically 30 days after their last activity. A session that never verifies is kept for only 6 hours.
- **Revocable**: `POST /api/v1/session/logout` invalidates one session's token without touching anyone else's.

### On-Device Gender Classification

- **Runs in the browser**: MediaPipe's BlazeFace finds the face and gates the capture button until you are well framed; face-api's age/gender net then classifies the crop. Both models are served from this origin, so no third party is contacted.
- **The frame never leaves your device**: only the resulting label and a confidence score are sent to the server. Nothing is uploaded, so there is nothing to store or leak.
- **The server records this claim; it does not verify it.** Classification happens on the client, so a modified client can assert any value: `POST /api/v1/verify/gender {"gender":"female"}` will succeed. The server validates the shape (an allowlist of `male`/`female`, a confidence in range) but cannot check the truth of it. `MIN_VERIFY_CONFIDENCE` still rejects an honest client's uncertain prediction, but it is advisory rather than a control.
- **What this is for**: keeping honest users honest and out of the wrong queue. It is not a defence against anyone who opens devtools, and it is not a liveness check.

### Smart Matching System

- **Gender-Based Matching**: Users can choose to match specifically with Male, Female, or Any gender. Gender-filtered matches are limited to **5 per rolling 24 hours**; "Any" is unlimited.
- **Verification Required**: Matchmaking is gated on verification, a confirmed age and an active account — anyone missing one cannot join the queue.
- **Skip Cooldown**: Skipping a match blocks the next search for 5 seconds.
- **Past Match Avoidance**: Once two users have been paired, they are not matched with each other again (the history is capped at the last 200 partners).

### Moderation

- **Reporting**: Users can report a match from the chat. An account reported by **3 distinct users** is automatically paused from matchmaking pending review.
- **Admin API**: Reports can be reviewed and resolved, and accounts limited or banned, through a bearer-token API. Every admin action is written to an audit log.

### Real-Time Chat

- **Instant Messaging**: Low-latency communication powered by Socket.IO.
- **Typing Indicators**: See when your match is typing.
- **Connection Status**: Visual indicators for connection health and encryption status.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, TailwindCSS v4, Radix UI (shadcn)
- **Backend**: Bun 1.4, Express 5, Socket.IO (single instance; the queue, presence and session cache are in-process)
- **Database**: MongoDB (sessions, reports, audit log), Redis (filter quota, rate-limit counters and the `lastActive` write throttle only)
- **On-device ML**: MediaPipe Tasks Vision (face detection, WASM) and @vladmandic/face-api (gender), both running in the browser
- **Testing**: `bun test` (server), Vitest + Testing Library + happy-dom (client)

### Repository Layout

| Path | What lives there |
| --- | --- |
| `client/` | The React SPA. `src/components` holds the screens (landing, profile, verify, chat), `src/lib` the classifier and crypto, `public/` the ML models. |
| `server/` | The API. `src/routes` + `src/controllers` for HTTP, `src/sockets` for matchmaking and chat, `src/services` for the domain logic, `src/models` for Mongoose schemas. |
| `.github/workflows/` | CI (`ci.yml`), commit linting (`commits.yml`) and the nightly backup (`backup.yml`). |
| `DOCUMENTATION.md` | Architecture, the trust model and the operational flows, in more depth than this file. |

---

## Running Locally

### Prerequisites

- [Bun](https://bun.com) **1.4.1+** — the server's runtime and the package manager for both packages. The exact version is pinned in `server/.bun-version`; older Bun cannot import mongoose (see [Deploying](#deploying)).
- Docker, for MongoDB and Redis. Both are required.

Node.js is not needed. Bun executes the server's TypeScript directly, so there
is no build step on the server.

### 1. Start MongoDB and Redis

```bash
docker compose up -d
```

`docker-compose.yml` provides only the two datastores, with their ports
published to the host. The server and client run directly on your machine.

Redis holds only what must survive a restart: the filter quota, the
socket-connect limiter, the HTTP rate limiters and the `lastActive` throttle.
Ordinary chat traffic costs no Redis commands at all. The server still refuses
to start listening until Redis is reachable.

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

`server/.env` is gitignored. The defaults work for local development:

| Variable | Purpose |
| --- | --- |
| `PORT` | Defaults to `5000` |
| `NODE_ENV` | `development` locally, `production` on Render. Stack traces are only returned when this is explicitly `development` or `test` |
| `MONGO_URI` | Defaults to `mongodb://localhost:27017/ghostly` |
| `REDIS_URL` | Defaults to `redis://localhost:6379`. Use `rediss://` for Upstash (TLS) |
| `CLIENT_URL` | Comma-separated origins allowed to call the API. Defaults to `http://localhost:5173` |
| `SESSION_SECRET` | Signs session tokens. Generate with `openssl rand -hex 32`. Rotating it signs out every user |
| `ADMIN_TOKEN` | Bearer token for `/api/v1/admin/*`. Unset means those routes return 503 (they fail closed) |
| `MIN_VERIFY_CONFIDENCE` | Minimum model confidence to grant verified status. Defaults to `0.85` |
| `REPORT_RETENTION_DAYS` | How long abuse reports are kept before a TTL index expires them. Defaults to `365`; `0` keeps them indefinitely. A policy choice rather than a technical one — 365 comfortably outlasts the 30-day session TTL, but the number is yours to set |
| `TRUSTED_PROXY_HOPS` | Only needed off Render/Cloudflare: the hop count for the `X-Forwarded-For` fallback |

**In production the server refuses to boot** if `SESSION_SECRET` is the default
or the `.env.example` placeholder, if `CLIENT_URL` is unset or still localhost,
if `MONGO_URI` / `REDIS_URL` are missing or point at localhost, or if a numeric
variable is not a number. Every one of these used to fail silently or much
later, so they are now boot errors.

### 3. Configure the client

```bash
cp client/.env.example client/.env
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | The API base, including the version prefix: `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | The Socket.IO origin: `http://localhost:5000`. Empty falls back to the page's own origin, which is wrong whenever the API is on a different one |

Both are inlined by Vite at build time.

### 4. Run the server and client

Each in its own terminal, from the repository root:

```bash
# API + Socket.IO on :5000
cd server && bun install && bun run dev

# UI on :5173
cd client && bun install && bun run dev
```

On a GNOME desktop, `./start_dev.sh` opens both in separate terminals and
`./stop_dev.sh` stops them.

Open **http://localhost:5173**.

### Checking it came up

```bash
curl localhost:5000/health     # {"status":"OK"}
```

The server log should show `Redis Connected`, `MongoDB Connected: localhost`
and `Server running on port 5000`.

`/health` is deliberately shallow: it does not touch Mongo or Redis. Render uses
it as a liveness probe, and a probe that fails when a dependency blips causes a
restart loop instead of reporting one.

---

## API

Every router is mounted at `/api/v1/*`. The unversioned `/api/*` is a
compatibility alias for clients cached before versioning existed.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/session/init` | — | Create or resume an anonymous session; returns a signed token |
| `POST` | `/session/logout` | session | Revoke this session's token |
| `POST` | `/verify/gender` | session | Record the on-device classification result |
| `POST` | `/profile/update` | session | Set nickname and match preference |
| `GET` | `/reports/count` | session | Report statistics for the current session |
| `GET` | `/admin/reports` | admin | List abuse reports |
| `POST` | `/admin/reports/:id/resolve` | admin | Resolve a report |
| `POST` | `/admin/sessions/:id/status` | admin | Set an account to `active`, `limited` or `banned` |
| `GET` | `/admin/audit` | admin | Read the admin audit log |

Matchmaking and chat run over Socket.IO: `join-queue`, `leave-queue`,
`next-match`, `leave-chat`, `exchange-key`, `join-room`, `send-message`,
`typing` and `report-user`.

---

## Testing

### Unit and integration tests

```bash
# Server
cd server
bun run typecheck       # tsc --noEmit — Bun strips types rather than checking them
bun run test            # bun test --isolate
bun run test:coverage   # fails below 80% lines / 78% functions

# Client
cd client
bun run lint
bun run test            # vitest run
bun run test:coverage
bun run build           # also typechecks (tsc -b)
```

Use `bun run test` on the server rather than bare `bun test`: `--isolate` gives
each test file its own module registry, so a `mock.module` in one file cannot
leak into the next and make the result depend on file order.

Client coverage thresholds are a **ratchet**, not a target. They sit just under
the current figures (~16% lines, measured across every source file rather than
only the ones a test imports) and must be raised as component tests land.

### End-to-end checks

The socket suites drive a real server: matchmaking, ECDH key exchange,
ciphertext relay, room authorisation and queue cleanup. Start the datastores
and the API first (`docker compose up -d`, then `cd server && bun run dev`),
then:

```bash
VERIFY_BASE=http://localhost:5000 bun server/scripts/verify-e2e.mjs
VERIFY_BASE=http://localhost:5000 bun server/scripts/verify-rematch.mjs  # ~40s
```

They default to port 3000, so pass `VERIFY_BASE` explicitly. Both seed their
fixtures through the `ghostly-mongo` container, so compose has to be up, and
`VERIFY_MONGO_DB` must name the same database as the server's `MONGO_URI` — a
mismatch fails silently, with the fixtures written where the server is not
looking. `verify-rematch.mjs` is the slower one because it waits out the
session-cache window to prove two users who just chatted are not immediately
paired again.

### Manual checklist

Two things no script can check, because they need a human: **webcam
verification with a real face**, and the UI in an actual browser. Run the
client (`cd client && bun run dev`) and open http://localhost:5173.

- [ ] Clear localStorage for the site first. Old `deviceId` keys are dead, so
      you get a fresh session — which is what every existing user sees on deploy.
- [ ] Complete a real webcam verification. A good capture should verify; a poor
      one should show a readable message, not a generic failure.
- [ ] Network tab during capture: the body is JSON and **no image is uploaded**.
      This is the headline privacy claim — confirm it yourself.
- [ ] Block `*/face-api/*` and capture: a readable "could not read that frame"
      message, and the user can retry rather than being stuck.

Face framing gate (a client-side pre-check; the server decision is unchanged):

- [ ] The capture button stays disabled until a single well-framed face is in
      the oval, and the oval turns green when it unlocks.
- [ ] Fail-open, model blocked: block `*/mediapipe/*` and reload. The button
      must be **enabled**, with no hint pill at all.
- [ ] Fail-open, escape hatch: stand back until it reads "Move a little closer"
      and wait ~8s. The button enables and reads "Capture anyway".
- [ ] Two people in frame reads "Only you should be in frame" — including when
      the second person is outside the visible crop but still in the raw stream.
- [ ] Resize across the `sm` breakpoint (640px) while framed. The verdict must
      not change: the container is 0.75 aspect below it and 0.92 above.
- [ ] A portrait phone and a landscape webcam both reach ready at arm's length.
      They crop on opposite axes, so test both if you can.
- [ ] Throttle to Fast 3G and walk the funnel from the landing page. The wasm
      should already be cached by the preload, so the camera is usable at once.
- [ ] Dev console: exactly one `[useFaceFraming] detector ready` per camera
      start, even under StrictMode's double mount.
- [ ] A gated capture still returns verified/gender/userHash and lands you in
      matchmaking.
- [ ] Open a second browser or private window, verify both, and chat. The
      lock/encryption indicator should appear for both sides.
- [ ] The typing indicator appears once and clears about 3s after you stop,
      rather than flickering per keystroke.
- [ ] Hit Next/Skip several times and confirm you are never left waiting on a
      partner who never responds.

---

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **Server**: install, typecheck, test, coverage gate.
- **Client**: install, lint, test, coverage gate, production build.
- **Deploy** (pushes to `main` only, after both pass): builds the SPA first,
  then triggers the Render deploy hook, then uploads the prebuilt SPA to Vercel.
  Building first means a failed SPA build stops the whole deploy instead of
  leaving the API updated and the SPA on its old build.

For the deploy job to act as a gate, turn off git auto-deploy in both Vercel
and Render. It needs repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID` and `RENDER_DEPLOY_HOOK`, plus repository variables
`VITE_API_URL` and `VITE_SOCKET_URL`. Each step skips itself if its secret is
missing, so a fork does not fail on deployment it was never meant to do.

`.github/workflows/commits.yml` enforces [Conventional Commits](https://www.conventionalcommits.org)
on pull requests (rules in `commitlint.config.mjs`: subject ≤ 72 characters,
body wrapped at 78). `.gitmessage` is a commit template for the part a linter
cannot check — the body explaining *why*.

---

## Deploying

Two independent deployments plus two managed datastores, all on free tiers.

| Piece | Where | Notes |
| --- | --- | --- |
| SPA | Vercel | Static Vite build. `client/vercel.json` carries the CSP and security headers. |
| API | Render | Native Bun runtime, `render.yaml`, Singapore region. Free tier spins down after 15 minutes idle. |
| Database | MongoDB Atlas M0 | 512MB, no automated backup — see below. |
| Redis | Upstash | Only quota, rate-limit and throttle counters live here. |

### Before the first deploy

**Pin the Bun version.** `server/.bun-version` does this and it is not optional:
Render's native runtime defaults to 1.3.14, which cannot import mongoose at all
(`bson` calls a `v8.startupSnapshot` API Bun did not implement until 1.4). An
unpinned deploy produces a server that never boots, failing with a `bson` stack
trace that names nothing relevant. CI reads the same file, so the three cannot
drift.

**Choose the region first.** `render.yaml` pins `singapore`. Region cannot be
changed on an existing Render service, only recreated, so change it before the
service is created if your users are elsewhere.

**Set the origins.** `CLIENT_URL` on Render must list every origin the SPA is
served from, comma-separated — the Vercel domain *and* any custom domain.
Cross-origin CORS does not degrade gracefully: a missing origin means the socket
handshake is refused and the app does nothing.

**The CSP names the API origins.** `client/vercel.json` lists both
`api.devyansh.tech` and `ghostly-api.onrender.com` in `connect-src`, so
`VITE_API_URL` can be repointed between the custom domain and the platform one
without editing the policy. Any other API origin has to be added there first —
until it is, the browser blocks every request and the WebSocket, and the SPA
loads but does nothing. `client/scripts/check-deploy-config.mjs` fails the build
if the placeholder ever comes back or the API URLs are unset.

**Set the build-time API URLs.** `VITE_API_URL` and `VITE_SOCKET_URL` are
inlined by Vite at build time, so they belong in the Vercel project (and in the
repository variables CI builds with) before the first deploy — changing them
later needs a rebuild, not a redeploy.

### What the free tier costs you

Render free **spins down after 15 minutes** without traffic and takes about a
minute to wake. For a product that pairs two strangers this is a real
limitation, not a detail: the queue needs two people online at once, and the
first arrival waits out a cold start on an empty queue. Matching is unreliable
by construction here. Everything else — verification, profiles, reporting —
works normally.

Vercel Hobby includes 100GB/month. The on-device models are ~11.7MB per
uncached visitor, so roughly 8,700 first-time visitors before the project is
paused for the rest of the window. They are preloaded only once a user reaches
the profile step rather than on arrival, and served with a one-year immutable
cache. Hobby is also non-commercial by its own terms.

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
