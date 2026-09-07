#!/bin/bash
# ==============================================================================
# Ghostly Azure Production Deployment Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS on Microsoft Azure (Standard_B2s VM)
# ==============================================================================

set -e

echo "================================================================"
echo "👻 Starting Ghostly Azure Production Setup..."
echo "================================================================"

# The 4GB swap that used to be provisioned here existed to survive building
# opencv and numpy for the Python AI service on two burstable vCPUs. That
# service is gone -- verification now runs in the browser -- so nothing heavy is
# compiled on this VM any more.

# 1. Check and Install Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "⚙️  Installing Docker Engine & Docker Compose..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-compose
    sudo usermod -aG docker $USER
    echo "✅ Docker installed successfully."
else
    echo "✅ Docker is already installed."
fi

# 2. Check and Create .env.production if missing (since .env* is gitignored)
echo "⚙️  Checking environment configuration..."
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production not found (likely ignored by git). Creating production config..."
    # Secrets are generated per-host and never committed. A hardcoded default
    # here would be readable by anyone with repo access, and SESSION_SECRET now
    # signs every session token.
    cat <<EOF > .env.production
PORT=5000
MONGO_URI=mongodb://mongo:27017/kylmo
CLIENT_URL=https://devyansh.tech
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)
MIN_VERIFY_CONFIDENCE=0.85
REDIS_URL=redis://redis:6379
EOF
    chmod 600 .env.production
    echo "✅ .env.production created with freshly generated secrets."
    echo "   Retrieve the admin token with: grep ADMIN_TOKEN .env.production"
else
    echo "✅ Found existing .env.production."

    # Secrets are repaired in place rather than reported as instructions to run
    # by hand. A deploy that prints "rotate this" and continues anyway is how a
    # known-compromised secret survives across releases.
    ENV_BACKED_UP=0
    backup_env_once() {
        if [ "$ENV_BACKED_UP" -eq 0 ]; then
            cp .env.production ".env.production.bak.$(date +%Y%m%d%H%M%S)"
            chmod 600 .env.production.bak.* 2>/dev/null || true
            ENV_BACKED_UP=1
        fi
    }

    # Any secret that has ever been committed is public to anyone with repo
    # access, and SESSION_SECRET signs every session token.
    if ! grep -q '^SESSION_SECRET=.\+' .env.production \
       || grep -qE '^SESSION_SECRET=(supersecret|klymo_production_secret_key)$' .env.production; then
        backup_env_once
        NEW_SECRET=$(openssl rand -hex 32)
        # Drop every existing definition before appending, so the file cannot
        # end up with two SESSION_SECRET lines where the last one wins.
        grep -v '^SESSION_SECRET=' .env.production > .env.production.tmp
        echo "SESSION_SECRET=$NEW_SECRET" >> .env.production.tmp
        mv .env.production.tmp .env.production
        chmod 600 .env.production
        echo "🔑 SESSION_SECRET was missing or a known default from git history."
        echo "   Rotated to a fresh value. Existing sessions are now invalid,"
        echo "   which this deploy would have done regardless."
    else
        echo "✅ SESSION_SECRET is set and is not a known default."
    fi

    if ! grep -q '^ADMIN_TOKEN=.\+' .env.production; then
        backup_env_once
        grep -v '^ADMIN_TOKEN=' .env.production > .env.production.tmp
        echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> .env.production.tmp
        mv .env.production.tmp .env.production
        chmod 600 .env.production
        echo "🔑 ADMIN_TOKEN was not set — generated one."
        echo "   Read it with: grep ADMIN_TOKEN .env.production"
    else
        echo "✅ ADMIN_TOKEN is set."
    fi

    if [ "$ENV_BACKED_UP" -eq 1 ]; then
        echo "   Previous .env.production saved as .env.production.bak.*"
    fi
fi

# 3. Build and Launch Production Docker Stack
# No `down` and no --force-recreate: those tore the whole stack offline on
# every deploy, including mongo and redis which rarely change. Compose only
# recreates services whose image or config actually differs.
echo "🚀 Building Ghostly images..."
sudo docker compose -f docker-compose.prod.yml build

echo "🚀 Rolling out changed services..."
sudo docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Containers from services this stack no longer has:
#   ghostly-client - the frontend is baked into the Caddy image now
#   ghostly-ai     - verification moved into the browser; the service is deleted
# --remove-orphans handles these only when the labels match; a container created
# by an older compose version can survive and keep answering on the network.
for stale in ghostly-client ghostly-ai; do
    if sudo docker ps -a --format '{{.Names}}' | grep -qx "$stale"; then
        echo "🧹 Removing $stale, left over from an earlier stack..."
        sudo docker rm -f "$stale" >/dev/null 2>&1 || true
    fi
done

# The ai-model image is ~598MB and nothing references it any more. image prune
# below only removes dangling layers, so this one is named explicitly.
sudo docker image rm -f ghostly-ai-model >/dev/null 2>&1 || true

echo "🧹 Removing images left dangling by this build..."
sudo docker image prune -f >/dev/null 2>&1 || true

# A deploy that half-succeeds should not report success. Compose exits 0 once
# containers are created, which says nothing about them staying up.
echo "🔍 Verifying the stack came up..."
sleep 10
DEPLOY_OK=1
for svc in caddy server mongo redis; do
    cid=$(sudo docker compose -f docker-compose.prod.yml ps -q "$svc" 2>/dev/null)
    if [ -z "$cid" ]; then
        echo "   ❌ $svc has no container"
        DEPLOY_OK=0
        continue
    fi

    state=$(sudo docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null)
    restarts=$(sudo docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null)
    if [ "$state" = "running" ]; then
        echo "   ✅ $svc running (restarts: $restarts)"
    else
        echo "   ❌ $svc is '$state' — check: sudo docker compose -f docker-compose.prod.yml logs $svc"
        DEPLOY_OK=0
    fi
done

echo "================================================================"
if [ "$DEPLOY_OK" -eq 1 ]; then
    echo "🎉 Deployment Complete!"
else
    echo "⚠️  Deployment finished with services not running — see above."
fi
echo "================================================================"
echo "Check running containers with: sudo docker ps"
echo "View logs with: sudo docker compose -f docker-compose.prod.yml logs -f"
echo "Your app should now be live at: https://devyansh.tech (or your configured domain)"
echo "================================================================"

[ "$DEPLOY_OK" -eq 1 ] || exit 1
