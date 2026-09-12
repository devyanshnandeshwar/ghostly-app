# Ghostly Client

The frontend for Ghostly: a React SPA built with Vite. It handles the age gate,
on-device verification, profile setup, matchmaking and end-to-end encrypted chat.

## Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (built on [Radix UI](https://www.radix-ui.com/)), [Lucide React](https://lucide.dev/) icons
- **State**: React Context (`SessionContext`, `MatchContext`, `SocketContext`)
- **Networking**: [Axios](https://axios-http.com/), [Socket.IO client](https://socket.io/docs/v4/client-api/)
- **On-device ML**: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector) (face detection) and [@vladmandic/face-api](https://github.com/vladmandic/face-api) (gender), served from `public/`
- **Testing**: [Vitest](https://vitest.dev/), Testing Library, happy-dom

## Setup

[Bun](https://bun.com) is the package manager.

```bash
cd client
bun install
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base including the version prefix, e.g. `http://localhost:5000/api/v1` |
| `VITE_SOCKET_URL` | Socket.IO origin, e.g. `http://localhost:5000`. Empty falls back to the page's own origin, which is wrong whenever the API is on a different one |

Both are inlined at build time, so changing them in production needs a rebuild.

## Development

```bash
bun run dev        # http://localhost:5173
```

The server must be running too — see the root README.

## Checks

```bash
bun run lint
bun run check:contrast  # every palette pair against WCAG AA
bun run test            # vitest run
bun run test:watch
bun run test:coverage
bun run build           # check-deploy-config, tsc -b, vite build
bun run preview         # serve the production build locally
```

`bun run build` first runs `scripts/check-deploy-config.mjs`. Under `CI=true` it
fails the build if the API URLs are unset or `vercel.json`'s CSP still carries a
placeholder — the misconfiguration that otherwise ships an app that loads and
cannot reach its own backend.

Coverage thresholds in `vitest.config.ts` are a ratchet: they sit just under the
current figures and must be raised as component tests land. Test config lives in
`vitest.config.ts`, not `vite.config.ts`, because the production build
typechecks `vite.config.ts` against a type with no `test` key.

## Project Structure

- `src/App.tsx` — the screen flow: landing → age gate → verify → profile → chat. `Verify`, `Chat` and `ProfileSetup` are lazy-loaded
- `src/components/` — the screens and their pieces (`AgeGate`, `Verify`, `ProfileSetup`, `Chat`, `ReportModal`, …); `ui/` holds vendored shadcn primitives
- `src/context/` — session, socket and match state
- `src/hooks/` — `useChatHook` (encrypted chat), `useFaceFraming` (MediaPipe capture gate), `useCountdown`
- `src/lib/` — the gender classifier and error helpers
- `src/services/` — the Axios client, session API and socket service
- `src/utils/` — `crypto.ts` (ECDH + AES-GCM) and `auth.ts` (session token storage)
- `public/mediapipe/`, `public/face-api/` — model files, served from this origin so no third party is contacted
- `vercel.json` — SPA rewrites, the CSP and security headers, and long-lived caching for the models

## Security Features

- **End-to-End Encryption**: each conversation generates a P-256 ECDH key pair in the browser, derives a shared AES-GCM key with the partner's public key, and encrypts every message before it leaves the browser (`src/utils/crypto.ts`, `src/hooks/useChatHook.ts`). Public keys are exchanged through the server and not verified out of band.
- **The camera frame never leaves the device**: classification runs in the browser and only `{ gender, confidence }` is sent. The canvas is zeroed straight after it is read (`src/components/Verify.tsx`).
- **Content Security Policy**: `vercel.json` restricts scripts to this origin and network calls to the configured API origins. A new API origin must be added to `connect-src` before it will work.
