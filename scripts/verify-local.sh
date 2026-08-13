#!/usr/bin/env bash
# Rebuilds the local stack and verifies it end to end.
#
#   ./scripts/verify-local.sh            rebuild, start, then run all checks
#   ./scripts/verify-local.sh --no-build use the running stack as-is
#
# Covers everything that can be checked without a browser. The webcam
# verification path and the visual UI still need a human; the checklist at the
# end lists exactly what.

set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${VERIFY_BASE:-http://localhost:3000}"
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

# ---------------------------------------------------------------- build/start

if [ "${1:-}" != "--no-build" ]; then
    head2 "Rebuilding images"
    $COMPOSE build || { echo "build failed"; exit 1; }
fi

head2 "Starting stack"
$COMPOSE up -d || { echo "startup failed"; exit 1; }

printf "  waiting for services"
for _ in $(seq 1 30); do
    if [ "$(status "$BASE/api/reports/count")" != "000" ]; then break; fi
    printf "."; sleep 2
done
echo

# ---------------------------------------------------------------- containers

head2 "Containers"
for c in ghostly-server ghostly-client ghostly-ai ghostly-mongo ghostly-redis; do
    st=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)
    restarts=$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo "?")
    if [ "$st" = "running" ]; then green "$c running (restarts: $restarts)"
    else red "$c is '$st'"; fi
done

# Containers must not be root — this regressed silently once already.
for c in ghostly-server:node ghostly-ai:appuser; do
    name="${c%%:*}"; want="${c##*:}"
    got=$(docker exec "$name" whoami 2>/dev/null || echo "?")
    if [ "$got" = "$want" ]; then green "$name runs as non-root ($got)"
    else red "$name runs as '$got' (want $want)"; fi
done

head2 "Service health"
expect_code "server /health"        200 "$(status "$BASE/health")"
ai=$(docker exec ghostly-server sh -c 'wget -qO- http://ai-model:8000/health' 2>/dev/null || echo "")
if echo "$ai" | grep -q '"status":"ok"'; then green "ai-model reachable from server"; else red "ai-model unreachable from server"; fi

log=$(docker logs ghostly-server 2>&1 | tail -30)
echo "$log" | grep -q "Redis Connected"                && green "Redis connected"        || red "Redis not connected"
echo "$log" | grep -q "Socket.IO Redis adapter attached" && green "Socket.IO adapter attached" || red "Socket.IO adapter missing"
echo "$log" | grep -q "MongoDB Connected"              && green "MongoDB connected"      || red "MongoDB not connected"

# ---------------------------------------------------------------- auth

head2 "Authentication"
TOKEN=$(curl -s -m 15 -X POST "$BASE/api/session/init" -H 'Content-Type: application/json' -d '{}' \
        | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)

[ -n "$TOKEN" ] && green "session init issued a token" || red "session init returned no token"
case "$TOKEN" in v1.*) green "token is signed (v1 format)";; *) red "token is not in the signed v1 format";; esac

INIT=$(curl -s -m 15 -X POST "$BASE/api/session/init" -H 'Content-Type: application/json' -d '{}')
if echo "$INIT" | grep -q deviceId; then red "response leaks deviceId"; else green "response does not leak deviceId"; fi

expect_code "protected route without a token" 401 "$(status "$BASE/api/protected")"
expect_code "protected route with a valid token" 200 "$(status -H "Authorization: Bearer $TOKEN" "$BASE/api/protected")"
expect_code "raw deviceId is not a credential"  401 "$(status -H "Authorization: Bearer 37c8994f-75fd-458f-bc7f-7e9e26749833" "$BASE/api/protected")"
expect_code "forged token rejected"             401 "$(status -H "Authorization: Bearer v1.ZXZpbA.badsig" "$BASE/api/protected")"

head2 "Admin API"
expect_code "admin route without a token" 401 "$(status "$BASE/api/admin/reports")"
ADMIN=$(grep '^ADMIN_TOKEN=' .env.production 2>/dev/null | cut -d= -f2)
if [ -n "$ADMIN" ]; then
    expect_code "admin route with the real token" 200 "$(status -H "Authorization: Bearer $ADMIN" "$BASE/api/admin/reports")"
else
    red "ADMIN_TOKEN missing from .env.production (admin API would return 503)"
fi

# ---------------------------------------------------------------- uploads

head2 "Verification endpoint"
TMP=$(mktemp -d)
# A valid JPEG containing no face, so the request reaches the detector rather
# than failing to decode. cv2 lives in the ai-model venv, not system python.
PY_BIN="python3"
[ -x ai-model/venv/bin/python ] && PY_BIN="ai-model/venv/bin/python"
"$PY_BIN" - "$TMP" <<'PY' 2>/dev/null
import sys, pathlib
out = pathlib.Path(sys.argv[1]) / "face.jpg"
try:
    import cv2, numpy as np
    cv2.imwrite(str(out), np.full((400, 400, 3), 127, np.uint8))
except Exception:
    out.write_bytes(bytes(3000))
PY
[ -s "$TMP/face.jpg" ] || head -c 3000 /dev/urandom > "$TMP/face.jpg"
head -c 6000000 /dev/zero > "$TMP/big.bin"

expect_code "upload without a token"    401 "$(status -X POST -F "image=@$TMP/face.jpg" "$BASE/api/verify/gender")"
expect_code "no face detected -> 422"   422 "$(status -H "Authorization: Bearer $TOKEN" -X POST -F "image=@$TMP/face.jpg" "$BASE/api/verify/gender")"
expect_code "oversized upload -> 413"   413 "$(status -H "Authorization: Bearer $TOKEN" -X POST -F "image=@$TMP/big.bin" "$BASE/api/verify/gender")"

# The point is that a rejected image explains itself rather than surfacing as
# "AI Service Unavailable", which is what it used to do.
body=$(curl -s -m 20 -H "Authorization: Bearer $TOKEN" -X POST -F "image=@$TMP/face.jpg" "$BASE/api/verify/gender")
if echo "$body" | grep -qiE "no face|invalid image"; then
    green "rejection explains itself: $body"
elif echo "$body" | grep -qi "unavailable"; then
    red "regression: image rejection reported as a service outage: $body"
else
    red "unexpected error body: $body"
fi
rm -rf "$TMP"

# ---------------------------------------------------------------- sockets

if [ -d server/node_modules/socket.io-client ]; then
    # Lives under server/ because Node resolves ESM imports from the script's
    # own directory, not the working directory.
    VERIFY_BASE="$BASE" node server/scripts/verify-e2e.mjs
    [ $? -eq 0 ] || FAIL=$((FAIL+1))
else
    printf "\n  \033[33mSKIP\033[0m  socket checks (run: cd server && npm install)\n"
fi

# ---------------------------------------------------------------- summary

head2 "Result"
printf "  %d passed, %d failed (HTTP layer)\n" "$PASS" "$FAIL"

cat <<'MANUAL'

Still needs a human — open http://localhost:3000

  [ ] Clear localStorage for the site first. Old deviceId keys are dead, so you
      will get a fresh session. That is expected, and is what every existing
      user will experience on deploy.
  [ ] Complete a real webcam verification. This is the one path no automated
      check covers. A good capture should verify; a poor one should show a
      readable message, not a generic failure.
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
