# Ghosty - Application Documentation

This document provides a detailed technical overview of the Ghosty application, its architecture, security mechanisms, and operational flows.

## 1. System Architecture

Ghosty follows a microservices-inspired architecture containerized with Docker, ensuring easy scalability and deployment.

### Component Diagram

```mermaid
flowchart TB
 subgraph Infrastructure["Infrastructure (EC2 / Docker Host)"]
        Nginx["Nginx Reverse Proxy"]
        Client["React Client Container"]
        Server["Node.js Backend Container"]
        AI["Python AI Service Container"]
  end
 subgraph Cloud["External Cloud Services"]
        Atlas[("MongoDB Atlas")]
  end
    User["User Browser"] -- HTTPS / WSS --> Nginx
    Nginx -- Static Assets --> Client
    Nginx -- "/api & /socket.io" --> Server
    Server -- Session Data --> Atlas
    Server -- Verify Image --> AI
    Server -- Stores --> Queues["In-Memory Queues"]
```

### Services Breakdown

- **Client (`/client`)**: A React SPA (Single Page Application) built with Vite and TailwindCSS. It handles the UI, webcam access, and Socket.IO client connections.
- **Server (`/server`)**: The core backend built with Node.js and Express. It manages:
  - **Socket.IO**: Real-time signaling for chat and matchmaking.
  - **Matchmaking Engine**: In-memory queuing system.
  - **Session Management**: Device fingerprinting and persistence via MongoDB.
- **AI Service (`/ai-model`)**: A FastAPI Python service running a Caffe Deep Learning model (OpenCV DNN) for:
  - Face Detection (SSD Framework)
  - Gender Classification
- **Nginx (`client/nginx.conf`)**: Serves the frontend and acts as a reverse proxy, routing `/api` and websocket requests to the backend.
- **Shared (`/shared`)**: Contains TypeScript interfaces and contract types shared between the Client and Server to ensure type safety across the network boundary.

---

## 2. Security & Privacy Features

We prioritized user privacy and anonymity in the architectural design.

### Delete-After-Verify Logic

One of the critical promises of Ghosty is that **no user images are stored**. This is enforced architecturaly, not just by policy.

**How it works:**

1.  **Capture**: User takes a snapshot in the browser.
2.  **Transmission**: The image blob is sent to the Node.js backend.
3.  **Forwarding**: The backend immediately streams this blob to the AI Service (Python).
4.  **Processing**:
    - The AI Service reads the request stream directly into a memory buffer (`bytes`).
    - Using `numpy` and `cv2.imdecode`, the raw bytes are converted to an image array in RAM.
    - The Neural Network processes this array to detect faces and classify gender.
5.  **Destruction**: Once the prediction JSON response is returned, the memory scope in the Python function ends. The Python Garbage Collector automatically frees the RAM blocks containing the image data.
6.  **Zero-Disk Policy**: At no point in this chain is `cv2.imwrite()` or `file.save()` called. The image never touches the hard drive.

### Device ID & Anonymous Sessions

To maintain queues and prevent abuse without requiring email/password, we use a **Device ID** system.

**Implementation:**

- **Generation**: A UUID is generated on the client-side (`localStorage`) upon first visit.
- **Persistence**: This ID acts as the "primary key" for the user's session.
- **Upsert Logic (MongoDB)**:
  ```typescript
  // server/src/services/session.service.ts
  UserSession.findOneAndUpdate(
      { deviceId },
      { $setOnInsert: { deviceId, ... } },
      { upsert: true, new: true }
  );
  ```
- **Benefit**: This allows a user to refresh the page and reconnect to their existing session/queue spot, while seemingly remaining "anonymous" (no PII collected).

---

## 3. Operational Workflows

### Architecture Diagram: Queuing & Socket Flow

The matchmaking flow determines how users are paired. It uses in-memory Maps for speed (`O(1)` access).

```mermaid
sequenceDiagram
    participant U as User (Socket)
    participant S as Server (SocketManager)
    participant Q as Match Service (Map)
    participant R as Session Service

    U->>S: Connect (Handshake auth: deviceId)
    S->>R: Verify/Load Session

    U->>S: Event: "find_match" (Pre: Male, Target: Female)
    S->>Q: addToQueue(User)

    Note right of Q: Search Priority: <br/>1. Compatible Pref<br/>2. Compatible Gender

    alt Match Found Immediately
        Q->>Q: Pop Candidate
        Q-->>S: Return Match(User1, User2)
        S->>U: Event: "match_found" (RoomID)
    else No Match
        Q->>Q: Push User to Queue
        S-->>U: Event: "waiting"
    end
```

### Verification Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant AI as AI Model

    C->>C: Capture Webcam Frame
    C->>S: POST /api/verify (FormData)
    S->>AI: POST /verify-gender

    Note over AI: Load into Memory -> Detect Face -> Classify

    AI-->>S: { gender: "male", confidence: 0.98 }

    alt Confidence > Threshold
        S->>S: Update Session (isVerified=true)
        S-->>C: 200 OK (Verified)
    else Low Confidence / No Face
        S-->>C: 422 Unprocessable Entity
    end
```

## 4. Additional Features

### End-to-End Encryption (Implemented)

The application implements full Client-side End-to-End Encryption (E2EE) data privacy.

**Implementation:**

- **Key Exchange**: Uses **ECDH (Elliptic-Curve Diffie-Hellman)**. When two users match, they exchange public keys via the socket server.
- **Secret Derivation**: A shared secret is derived in the browser.
- **Message Encryption**: Chats are encrypted using **AES-GCM** with the derived secret.
- **Security Check**: The server transfers the envelopes but **cannot decrypt** the messages as it never possesses the private keys.

### DDoS Protection & Rate Limiting

To ensure stability and availability, the system implements application-level Rate Limiting.

**Implementation:**

- Uses `express-rate-limit` middleware.
- Limits the number of requests a single IP can make within a time window (e.g., 100 requests per 15 mins).
- Protects API routes (`/api/*`) from abuse and brute-force attacks.

### Horizontal Scaling (Future Proofing)

The code was designed with scaling in mind (originally using Redis Adapters). While currently running in a single-node "In-Memory" mode for simpler EC2 deployment, the codebase contains the structures (Queue Interfaces, Pub/Sub patterns) to easily switch back to Redis for multi-server scaling.

### Robust Error Handling

- **Graceful Degraded State**: If the AI Verification service goes down, the rest of the application (Chat, "Unverified" matchmaking) continues to function.
- **Reconnection Logic**: The frontend handles network dips automatically, re-establishing socket connections without losing the session state.

---

_Generated by Antigravity Agent for Ghosty Project_
