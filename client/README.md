# Ghostly Client

This directory contains the frontend application for Ghostly, built with React and Vite. It provides the user interface for anonymous chatting, profile setup, and matchmaking.

## Tech Stack

- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Shadcn UI](https://ui.shadcn.com/) (built on [Radix UI](https://www.radix-ui.com/)), [Lucide React](https://lucide.dev/) (Icons)
- **State Management**: React Context (SessionContext, MatchContext)
- **Networking**: [Axios](https://axios-http.com/), [Socket.io-client](https://socket.io/docs/v4/client-api/)

## Setup & Installation

1.  Navigate to the `client` directory:

    ```bash
    cd client
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Configure environment variables:
    Copy `.env.example` to `.env` and update the values if necessary.
    ```bash
    cp .env.example .env
    ```

## Development

To start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (default Vite port).

## Build

To build the application for production:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Project Structure

- `src/components`: Reusable UI components and feature-specific components (Chat, ProfileSetup, etc.).
- `src/context`: React Context providers for global state (Session, Match).
- `src/lib`: Utility functions and helper classes.
- `src/App.tsx`: Main application component and routing logic.
