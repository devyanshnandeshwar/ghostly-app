#!/bin/bash

# Ghosty Startup Script
# Opens 3 terminals: Client, Server, and AI Model

PROJECT_ROOT=$(pwd)

echo "Starting Ghosty Development Environment..."

gnome-terminal --title="Ghosty AI Service" -- bash -c "cd ai-model; source venv/bin/activate; python3 -m uvicorn app.main:app --reload --port 8000; exec bash"

gnome-terminal --title="Ghosty Server" -- bash -c "cd server; npm run dev; exec bash"

gnome-terminal --title="Ghosty Client" -- bash -c "cd client; npm run dev; exec bash"



echo "All services launched in separate terminals."
