# Outstanding tasks

State as of 2026-08-13. Work sits on the `update` branch (11 commits, **not merged**).
Items 1–28 refer to the numbering used in the triage review; 24 of them are done.

---

## 1. Deploy-blocking

These must happen before or during the next production deploy. Nothing here is
optional.

### 1.1 Rotate `SESSION_SECRET` on the Azure VM

**Only the local `.env.production` was rotated.** The VM has its own copy, which
is gitignored and was never touched by this work — it almost certainly still
contains `klymo_production_secret_key`, the value `azure_deploy.sh` used to write
and which is in git history.

That string now signs every session token, so anyone with repo access can forge a
session for any user.

```bash
# on the VM, in the repo directory
openssl rand -hex 32          # paste into SESSION_SECRET in .env.production
```

`azure_deploy.sh` now refuses to deploy if it finds that value, so a deploy will
fail loudly rather than silently continue. Rotating invalidates existing sessions,
which this deploy does anyway.

### 1.2 Add `ADMIN_TOKEN` on the Azure VM

Same situation. Without it `/api/admin/*` returns **503** — locked, but unusable
by you. The deploy script warns rather than aborts.

```bash
echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> .env.production
```

### 1.3 The frontend container is gone — rebuild, don't just pull

Item 21 folded nginx into Caddy. The prod stack is now **five services**, and the
`client` service no longer exists in `docker-compose.prod.yml`. The Caddy image is
now built from `caddy/Dockerfile` and has the SPA baked in at `/srv`.

A deploy that only restarts containers will leave the old six-service stack
running. Run a build:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker rm -f ghostly-client 2>/dev/null   # orphan from the old stack
```

### 1.4 Check production Redis for stale queue entries

A leftover queue entry pointing at a long-dead socket was found in the local
Redis during testing — a real user matching against it would enter a chat whose
partner never responds. The fix prevents new orphans but does not clear old ones.

```bash
docker exec ghostly-redis redis-cli --scan --pattern 'ghosty:queue:*'
# inspect, then if the queues should be empty at a quiet moment:
docker exec ghostly-redis redis-cli --scan --pattern 'ghosty:queue:*' | xargs -r docker exec -i ghostly-redis redis-cli del
```

---

## 2. Verification before merging `update` → main

- [ ] **Clear localStorage** for the site first. Old `deviceId` keys are dead; you
      will get a fresh session. That is expected and is what every existing user
      will experience.
- [ ] **Webcam verification end to end.** The one path never exercised — it needs a
      real camera. Confirm a good capture verifies, and that a low-confidence
      result returns a readable message rather than a generic failure.
- [ ] **Two-browser chat.** Automated coverage exists for match, key exchange,
      ciphertext relay and typing, but not for the real UI.
- [ ] **Skip / next-match repeatedly** and confirm nobody is left stranded in the
      queue.
- [ ] Confirm Caddy serves the site over real TLS on the actual domain. Local
      testing used `http://localhost` to avoid hitting Let's Encrypt.

---

## 3. Needs a decision from you

Four items were deliberately left. Each changes the product's trust model or data
architecture, so starting one without your call would be guessing.

### Item 13 — E2EE key exchange has no fingerprint verification

Public keys are relayed by the server with nothing binding them to a peer, so
whoever controls the relay could substitute their own and read everything.

The standard fix — show both users a fingerprint to compare out of band — assumes
an out-of-band channel exists. Here the users are anonymous strangers who share
only the chat itself, and a malicious server could rewrite fingerprints read aloud
inside that chat. The usual fix is close to theatre in this product.

Real options:
1. Accept the server as trusted and say so. **Currently taken** — the README
   claim was reworded to state what actually holds.
2. Pin the server's identity so a substituted key is detectable.
3. Key transparency / an append-only log.

Effort: ~1 day once the approach is chosen.

### Item 14 — No liveness check on verification

Any photo passes; it need not be of the account holder. The confidence floor stops
low-quality guesses, not deliberate impersonation.

A real fix is a challenge–response flow (blink, turn your head), which needs
multi-frame capture and face landmarks the current Caffe model does not provide.
Best done **with** item 22, since MediaPipe supplies exactly those landmarks.

Decide first: is verification meant to deter casual misuse, or resist determined
attackers? The two answers imply very different budgets.

Effort: ~2 days.

### Item 22 — Move face detection to the browser

`ai-model/app/services/detection.py:58` runs two DNN passes server-side. The
detection half belongs in the browser: a live bounding box instead of blind
capture, frames with no face never leaving the device, a small crop uploaded
instead of a full frame, and one fewer DNN pass on the server.

Item 27 already downscales uploads to a 640px edge, so part of the bandwidth win
is banked.

**Classification must stay server-side** — if the client asserts its own gender,
verification means nothing. Open question: does the server still re-run detection
as defence in depth? That costs most of the CPU saving but stops a cropped-image
attack from being trivial.

Effort: 1–2 days. Clearest payoff of the four.

### Item 23 — Move sessions to Redis, drop MongoDB

Still the largest resource line item: a 1.19 GB image for two small collections.
Every `UserSession` field is disposable by design, every query is by `_id` or
`deviceId`, and Redis already holds the queue, presence, the session cache and
rate limits.

Item 17 capped the cache at 0.25 GB, which banks most of the memory win for one
line — **urgency dropped a lot**.

What needs deciding: where do reports go? They are the one thing here that
genuinely needs durability. Azure Table Storage, a small Postgres, or a much
smaller Mongo kept only for them.

Effort: 2–3 days.

---

## 4. Housekeeping

### 4.1 Enable the CI workflow

`.github/workflows/build-and-push.yml` builds all three production images and
pushes them to Azure Container Registry, tagged with both `latest` and the commit
SHA so a bad deploy can be rolled back rather than rebuilt.

It will not run until these repository secrets exist:

| Secret | How to get it |
| --- | --- |
| `ACR_LOGIN_SERVER` | e.g. `ghostly.azurecr.io` |
| `ACR_USERNAME` | `az acr credential show --name <registry>` |
| `ACR_PASSWORD` | same command |

Enable the admin user first: `az acr update --name <registry> --admin-enabled true`

Once running, the VM never compiles anything and the 4 GB swap in
`azure_deploy.sh` becomes unnecessary.

### 4.2 Local disk is at 98%

~5 GB free. Builds succeed but the margin is thin. Two unused images from other
projects would reclaim ~898 MB; deleting them was blocked by a permission prompt
during this work, so it needs to be done manually:

```bash
docker rmi postgres:16-alpine          # re-pullable in one command
docker rmi store-intelligence-api      # local build — needs its repo to rebuild
```

### 4.3 Dev and prod now serve the frontend differently

`docker-compose.prod.yml` has Caddy serving the SPA directly. `docker-compose.yml`
(dev) still uses the nginx `client` container on port 3000, because dev has no TLS
or domain to route.

`client/Dockerfile` and `client/nginx.conf` are therefore still live and used —
they are not dead code. Worth revisiting if the divergence causes confusion.

### 4.4 Consider removing the 4 GB swap

`azure_deploy.sh:13–24` provisions it to survive building opencv/numpy on two
burstable vCPUs. Once 4.1 is done nothing is built on the VM and the swap is
mostly pointless.

---

## 5. Smaller known rough edges

- **`removeUserFromQueue` still has a scan fallback** for when the reverse index
  has expired (`server/src/services/match.service.ts`). Correct, but the fallback
  path is untested against a real expiry.
- **The session cache TTL is 60 s** (`server/src/services/session.service.ts`).
  Invalidation on profile update and verification is wired, but any *new* writer
  of those fields must call `invalidateSessionCache` or it will serve stale data
  for up to a minute.
- **`lastActive` is throttled to one write per hour per session.** A user active
  for 29 days then idle for 31 will still be expired. Fine for an ephemeral chat
  app; worth knowing.
- **Reports have no retention policy.** `UserSession` has a TTL index; `Report`
  does not, so the collection grows without bound.
