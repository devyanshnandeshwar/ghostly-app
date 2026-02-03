# Ghostly Server

This directory contains the backend server for Ghostly, built with Node.js, Express, and Socket.io. It handles user sessions, matchmaking logic, and real-time chat communication.

## Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express](https://expressjs.com/)
- **Language**: TypeScript
- **Real-time Communication**: [Socket.io](https://socket.io/)
- **Database**: [MongoDB](https://www.mongodb.com/) (via Mongoose)
- **Validation**: [Zod](https://github.com/colinhacks/zod)
- **Utilities**: [Axios](https://axios-http.com/), [Multer](https://github.com/expressjs/multer) (file uploads), [Form-Data](https://github.com/form-data/form-data)

## Setup & Installation

1.  Navigate to the `server` directory:

    ```bash
    cd server
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Configure environment variables:
    Copy `.env.example` to `.env` and fill in the required values (e.g., MongoDB URI, PORT).
    ```bash
    cp .env.example .env
    ```

## Development

To start the development server with [Nodemon](https://nodemon.io/):

```bash
npm run dev
```

The server will be available at `http://localhost:3000` (or the port specified in `.env`).

## Build

To compile the TypeScript code to JavaScript:

```bash
npm run build
```

## Production

To start the production server:

```bash
npm start
```

## Key Components

- `src/server.ts`: Entry point of the application.
- `src/sockets`: Socket.io event handlers and logic (e.g., matchmaking).
- `src/models`: Mongoose schemas and models.
- `src/routes`: API routes (if any separate from sockets).
- `src/middleware`: Custom middleware (e.g., error handling, authentication).
