# Ghostly

Ghostly is an anonymous chatting platform that connects users based on interests, verifying their identity using AI-powered face and gender detection.

## Project Structure

This repository is organized into three main components:

- **[client](./client/README.md)**: The frontend application built with React, Vite, and Tailwind CSS.
- **[server](./server/README.md)**: The backend API and WebSocket server built with Node.js, Express, and Socket.io.
- **[ai-model](./ai-model/README.md)**: The AI service for face and gender detection built with Python and FastAPI.

## Getting Started

To run the full application locally, you will need to set up and run all three services concurrently.

### Prerequisites

- Node.js (v18+)
- Python (v3.8+)
- MongoDB (local or Atlas)
- Redis (v6+)

### Quick Start

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/ghostly-app.git
    cd ghostly-app
    ```

2.  **Start Background Services:**
    Ensure MongoDB and Redis are running.

    ```bash
    # Linux/Mac
    sudo service redis-server start
    sudo service mongod start
    ```

3.  **Setup the AI Model Service:**

    ```bash
    cd ai-model
    python -m venv venv
    source venv/bin/activate # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload
    ```

    (Runs on port 8000)

4.  **Setup the Server:**
    Open a new terminal.

    ```bash
    cd server
    npm install
    cp .env.example .env # Configure your .env variables
    npm run dev
    ```

    (Runs on port 3000 by default)

5.  **Setup the Client:**
    Open a new terminal.

    ```bash
    cd client
    npm install
    cp .env.example .env # Configure your .env variables
    npm run dev
    ```

    (Runs on port 5173 by default)

6.  **Access the App:**
    Open your browser and navigate to `http://localhost:5173`.

    ```

    ```

## 🚀 Deployment

For production deployment instructions using Fly.io, Docker, and Custom Domains, please read the **[Deployment Guide](./DEPLOYMENT.md)**.

## 🤝 Contributing

Please refer to the `README.md` in each subdirectory for specific contribution guidelines and development details.
