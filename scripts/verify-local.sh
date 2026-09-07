#!/usr/bin/env bash
# Verifies the API end to end against a locally running server.
#
#   ./scripts/verify-local.sh             start deps, start the server, check
#   ./scripts/verify-local.sh --no-build  use an already-running server
#
# The app no longer runs in Docker: it deploys to Render (API) and Vercel
# (SPA), so compose provides only MongoDB and Redis and the server runs on the
# host. Checks therefore target the server's own port, not a proxy.
#
# Covers everything that can be checked without a browser. The webcam
# verification path and the visual UI still need a human; the checklist at the
# end lists exactly what.

set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${VERIFY_BASE:-http://localhost:5000}"
COMPOSE="docker compose -f docker-compose.yml"
PASS=0
FAIL=0

green() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; PASS=$((PASS+1)); }
red()   { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; FAIL=$((FAIL+1)); }
head2() { printf "\n\033[1m%s\033[0m\n" "$1"; }

expect_code() { # label, expected, actual
    if [ "$2" = "$3" ]; then green "$1  (HTTP $3)"; else red "$1  (want $2, got $3)"; fi
}

code() { curl -s -o /dev/null -w "%{code_http:-%{http_code}}" -m 15 "$@" 2>/dev/null || echo "000"; }
status() { curl -s -o /dev/null -w "%{http_code}" -m 15 "$@" 2>/dev/null || echo "000"; }

# ------------------------------------------------------------- deps + server

SERVER_PID=""
cleanup() {
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

if [ "${1:-}" != "--no-build" ]; then
    head2 "Starting MongoDB and Redis"
    $COMPOSE up -d || { echo "failed to start dependencies"; exit 1; }

    head2 "Starting the API"
    (cd server && bun src/server.ts) &
    SERVER_PID=$!
fi

printf "  waiting for services"
# Wait for the SERVER, not just the proxy in front of it. nginx starts answering
# with 502 the moment it is up, so breaking on "anything but 000" let the whole
# suite run against a backend that had not finished booting -- every check then
# failed with 502 on a cold start.
for _ in $(seq 1 45); do
    code=$(status "$BASE/api/v1/reports/count")
    case "$code" in
        000|502|503|504) printf "."; sleep 2 ;;
        *) break ;;
    esac
done
echo

# ------------------------------------------------------------------ services

head2 "Dependencies"
for c in ghostly-mongo ghostly-redis; do
    st=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)
    if [ "$st" = "running" ]; then green "$c running"
    else red "$c is '$st'"; fi
done

head2 "Service health"
# Reachable directly now. /health used to be probed from inside the container
# because the proxy in front of it forwarded only /api and /socket.io, so
# curling it through the proxy fell through to the SPA and returned 200 with
# index.html -- an assertion that passed with the server completely stopped.
# There is no proxy any more, so this hits the real endpoint.
health=$(curl -s -m 10 "$BASE/health" 2>/dev/null || echo "")
if echo "$health" | grep -q '"status":"OK"'; then
    green "server /health"
else
    red "server /health unreachable (got: ${health:-nothing})"
fi

# ---------------------------------------------------------------- auth

head2 "Authentication"
TOKEN=$(curl -s -m 15 -X POST "$BASE/api/v1/session/init" -H 'Content-Type: application/json' -d '{}' \
        | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

[ -n "$TOKEN" ] && green "session init issued a token" || red "session init returned no token"
case "$TOKEN" in v1.*) green "token is signed (v1 format)";; *) red "token is not in the signed v1 format";; esac

INIT=$(curl -s -m 15 -X POST "$BASE/api/v1/session/init" -H 'Content-Type: application/json' -d '{}')
if echo "$INIT" | grep -q deviceId; then red "response leaks deviceId"; else green "response does not leak deviceId"; fi

# These four exercise the session middleware, not the reports feature. They used
# to hit /api/protected, a debug route dropped in e4a83be -- after which they
# asserted 401/200 against a 404 and quietly went red. GET /api/reports/count is
# the stand-in: verifySession-guarded, read-only, and no per-route rate limit.
AUTHED="$BASE/api/v1/reports/count"
expect_code "protected route without a token" 401 "$(status "$AUTHED")"
expect_code "protected route with a valid token" 200 "$(status -H "Authorization: Bearer $TOKEN" "$AUTHED")"
expect_code "raw deviceId is not a credential"  401 "$(status -H "Authorization: Bearer 37c8994f-75fd-458f-bc7f-7e9e26749833" "$AUTHED")"
expect_code "forged token rejected"             401 "$(status -H "Authorization: Bearer v1.ZXZpbA.badsig" "$AUTHED")"

head2 "Admin API"
expect_code "admin route without a token" 401 "$(status "$BASE/api/v1/admin/reports")"
ADMIN=$(grep '^ADMIN_TOKEN=' .env.production 2>/dev/null | cut -d= -f2)
if [ -n "$ADMIN" ]; then
    expect_code "admin route with the real token" 200 "$(status -H "Authorization: Bearer $ADMIN" "$BASE/api/v1/admin/reports")"
else
    red "ADMIN_TOKEN missing from .env.production (admin API would return 503)"
fi

# ------------------------------------------------------------ verification

head2 "Verification endpoint"
# No image is uploaded any more: the frame is classified in the browser and only
# the resulting claim is POSTed as JSON. That means this endpoint is fully
# exercisable without a camera -- which is also precisely the trust trade-off,
# so the "valid claim accepted" case below is asserted deliberately rather than
# left to be discovered later.
# Note: verifyLimiter allows 5 requests a minute and counts the 401 too, so keep
# this block at four.
post_json() {
    status -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        -X POST -d "$1" "$BASE/api/v1/verify/gender"
}

expect_code "claim without a token"      401 "$(status -H "Content-Type: application/json" -X POST -d '{"gender":"female","confidence":0.95}' "$BASE/api/v1/verify/gender")"
expect_code "unknown gender -> 400"      400 "$(post_json '{"gender":"other","confidence":0.95}')"
expect_code "low confidence -> 422"      422 "$(post_json '{"gender":"female","confidence":0.10}')"
expect_code "valid claim accepted"       200 "$(post_json '{"gender":"female","confidence":0.95}')"


# ---------------------------------------------------------------- sockets

if [ -d server/node_modules/socket.io-client ]; then
    # Lives under server/ because Node resolves ESM imports from the script's
    # own directory, not the working directory.
    VERIFY_BASE="$BASE" VERIFY_MONGO_DB="${VERIFY_MONGO_DB:-ghostly}" bun server/scripts/verify-e2e.mjs
    [ $? -eq 0 ] || FAIL=$((FAIL+1))

    # Separate because it must wait out the 30s match cooldown to prove that a
    # just-matched pair is not immediately paired again.
    if [ "${VERIFY_SLOW:-1}" = "1" ]; then
        printf "\n\033[1mRematch regression\033[0m (~40s, set VERIFY_SLOW=0 to skip)\n"
        VERIFY_BASE="$BASE" VERIFY_MONGO_DB="${VERIFY_MONGO_DB:-ghostly}" bun server/scripts/verify-rematch.mjs
        [ $? -eq 0 ] || FAIL=$((FAIL+1))
    fi
else
    printf "\n  \033[33mSKIP\033[0m  socket checks (run: cd server && bun install)\n"
fi

# ---------------------------------------------------------------- summary

head2 "Result"
printf "  %d passed, %d failed (HTTP layer)\n" "$PASS" "$FAIL"

cat <<'MANUAL'

Still needs a human — run the client (cd client && bun run dev) and open http://localhost:5173

  [ ] Clear localStorage for the site first. Old deviceId keys are dead, so you
      will get a fresh session. That is expected, and is what every existing
      user will experience on deploy.
  [ ] Complete a real webcam verification. This is the one path no automated
      check covers. A good capture should verify; a poor one should show a
      readable message, not a generic failure.
  [ ] Network tab during capture: the request body is JSON and NO image is
      uploaded anywhere. This is the headline privacy claim -- confirm it.
  [ ] Block */face-api/* and capture: a readable "could not read that frame"
      message and the user can retry. They must not be stuck.

  Face framing gate (client-side pre-check; the server decision is unchanged):
  [ ] The capture button stays disabled until a single well-framed face is in
      the oval, and the oval turns green when it unlocks.
  [ ] Fail-open, model blocked: DevTools -> Network -> block */mediapipe/*, then
      reload. The button must be ENABLED and no hint pill should appear at all.
  [ ] Fail-open, escape hatch: stand back until it reads "Move a little closer"
      and wait ~8s. The button enables and reads "Capture anyway".
  [ ] Two people in frame reads "Only you should be in frame" — including when
      the second person is outside the visible crop but still in the raw stream.
  [ ] Resize across the sm breakpoint (640px) while framed. The verdict must not
      change: the container is 0.75 aspect below it and 0.92 above.
  [ ] A portrait phone and a landscape webcam both reach ready at a comfortable
      arm's length. These crop on opposite axes, so test both if you can.
  [ ] Throttle to Fast 3G and walk the funnel from the landing page. The wasm
      should already be cached by the preload, so the camera is usable at once.
  [ ] Dev console: exactly one "[useFaceFraming] detector ready" per camera
      start, even under StrictMode's double mount.
  [ ] A gated capture still returns verified/gender/userHash and lands you in
      matchmaking.
  [ ] Open a second browser (or a private window), verify both, and chat.
      Confirm the lock/encryption indicator appears for both sides.
  [ ] Watch the typing indicator: it should appear once and clear about 3s
      after you stop, not flicker per keystroke.
  [ ] Hit Next/Skip several times and confirm you are never left waiting
      against a partner who never responds.
  [ ] Check the layout is unchanged after the Tailwind class renames —
      chat height, avatar gradient, nickname truncation, camera aspect ratio.

MANUAL

[ "$FAIL" -eq 0 ] || exit 1
