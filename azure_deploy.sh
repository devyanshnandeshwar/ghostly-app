#!/bin/bash
# ==============================================================================
# Ghostly Azure Production Deployment Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS on Microsoft Azure (Standard_B2s VM)
# ==============================================================================

set -e

echo "================================================================"
echo "👻 Starting Ghostly Azure Production Setup..."
echo "================================================================"

# 1. Setup 4GB Swap Space (Prevent Out-Of-Memory crashes during AI Model loading)
if [ -f /swapfile ]; then
    echo "✅ Swap space already exists. Skipping swap creation."
else
    echo "⚙️  Creating 4GB Linux Swap space for AI Model stability..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ 4GB Swap space created and enabled."
fi

# 2. Check and Install Docker & Docker Compose
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

# 3. Check and Create .env.production if missing (since .env* is gitignored)
echo "⚙️  Checking environment configuration..."
if [ ! -f .env.production ]; then
    echo "⚠️  .env.production not found (likely ignored by git). Creating default production config..."
    cat <<EOF > .env.production
PORT=5000
MONGO_URI=mongodb://mongo:27017/kylmo
CLIENT_URL=https://devyansh.tech
NODE_ENV=production
SESSION_SECRET=klymo_production_secret_key
AI_MODEL_URL=http://ai-model:8000/api/verify-gender
REDIS_URL=redis://redis:6379
EOF
    echo "✅ Default .env.production created for https://devyansh.tech."
else
    echo "✅ Found existing .env.production."
fi

# 4. Build and Launch Production Docker Stack
echo "🚀 Building and launching Ghostly containers via Docker Compose..."
sudo docker-compose -f docker-compose.prod.yml up -d --build

echo "================================================================"
echo "🎉 Deployment Complete!"
echo "================================================================"
echo "Check running containers with: sudo docker ps"
echo "View logs with: sudo docker-compose -f docker-compose.prod.yml logs -f"
echo "Your app should now be live at: https://devyansh.tech/ghostly (or your configured domain)"
echo "================================================================"
