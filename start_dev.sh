#!/bin/bash

# Ghosty Startup Script
# Opens 2 terminals: Client and Server

echo "Starting Ghosty Development Environment..."

gnome-terminal --title="Ghosty Server" -- bash -c "cd server; bun run dev; exec bash"

gnome-terminal --title="Ghosty Client" -- bash -c "cd client; bun run dev; exec bash"

echo "All services launched in separate terminals."
