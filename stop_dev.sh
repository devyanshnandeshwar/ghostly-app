#!/bin/bash

# Ghosty Stop Script
# Kills the specific processes started by start_dev.sh

echo "Stopping Ghosty Services..."

# 1. Kill AI Service
echo "Stopping AI Service (uvicorn)..."
pkill -f "uvicorn app.main:app" || echo "AI Service already stopped or not found."

# 2. Kill Server (nodemon)
echo "Stopping Server (nodemon)..."
pkill -f "nodemon src/server.ts" || echo "Server already stopped or not found."

# 3. Kill Client (vite)
echo "Stopping Client (vite)..."
pkill -f "vite" || echo "Client already stopped or not found."
# Note: 'vite' is a common process name, so this might be broad if multiple vite projects are running.
# A more specific check would be checking the CWD, but simplistic pkill is usually fine for dev envs.

echo "All Ghosty services have been successfully signaled to stop."
