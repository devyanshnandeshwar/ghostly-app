#!/bin/bash

# Ghosty Stop Script
# Kills the specific processes started by start_dev.sh

echo "Stopping Ghosty Services..."

# 1. Kill Server
# Matches how the server is actually started (server/package.json: "dev").
# This used to look for "nodemon src/server.ts", which stopped matching anything
# at the Bun migration -- so the script reported success while leaving the server
# running.
#
# Keep "--watch" in the pattern. The Docker container runs plain
# `bun src/server.ts` and its process is visible on the host, so a looser
# pattern would reach into a running compose stack and kill it.
echo "Stopping Server (bun --watch)..."
pkill -f "bun --watch src/server.ts" || echo "Server already stopped or not found."

# 2. Kill Client (vite)
echo "Stopping Client (vite)..."
pkill -f "vite" || echo "Client already stopped or not found."
# Note: 'vite' is a common process name, so this might be broad if multiple vite projects are running.
# A more specific check would be checking the CWD, but simplistic pkill is usually fine for dev envs.

echo "All Ghosty services have been successfully signaled to stop."
