# Ghosty

Ghosty is an anonymous chat application that pairs users for real-time conversations based on gender and verification status. It leverages AI for authentic gender verification to ensure a safe and genuine user experience.

## Features

### Anonymous & Secure

- **No Sign-up Required**: Jump straight into chatting without creating an account.
- **End-to-End Encryption**: Chats are encrypted, ensuring privacy.
- **Ephemeral Sessions**: User sessions are temporary and data is not persisted after the session ends.

### AI-Powered Gender Verification

- **Real-time Verification**: Uses a Deep Neural Network (DNN) based face detector and gender classification model to verify user gender via webcam.
- **Anti-Spoofing**: Ensures users are real people before they can join specific queues.
- **Privacy First**: Images are processed in-memory for verification and immediately discarded; they are never stored.

### Smart Matching System

- **Gender-Based Matching**: Users can choose to match specifically with Male, Female, or Any gender.
- **Priority Queues**: Verified users get priority in matchmaking.
- **Cooldowns**: Prevents spamming and ensures fair usage.
- **Past Match Avoidance**: The system intelligently avoids pairing you with the same person accurately.

### Real-Time Chat

- **Instant Messaging**: Low-latency communication powered by Socket.IO.
- **Typing Indicators**: See when your match is typing.
- **Connection Status**: Visual indicators for connection health and encryption status.

---

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Database**: MongoDB (Session data), In-Memory Maps (Queues & Rate Limiting)
- **AI Service**: Python, FastAPI/Uvicorn, OpenCV, Caffe Model

---

## Running Locally

Follow these steps to get the application running on your local machine.

### Prerequisites

- Node.js (v18+)
- Python (v3.9+)
- MongoDB Atlas URI

### 1. Server (Backend)

Navigate to the server directory and start the backend.

```bash
cd server
npm install
npm run dev
```

Runs on: `http://localhost:5000`

### 2. AI Model service

Navigate to the AI model directory to start the gender verification service.

```bash
cd ai-model
# Create virtual environment (optional)
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn app.main:app --reload --port 8000
```

Runs on: `http://localhost:8000`

### 3. Client (Frontend)

Navigate to the client directory to start the user interface.

```bash
cd client
npm install
npm run dev
```

Runs on: `http://localhost:5173`

Open **http://localhost:5173** in your browser to use the app.

---

## Contribution

**Contributions are currently NOT accepted.**
This project is currently in a closed development phase. Please do not submit Pull Requests as they will be closed.
