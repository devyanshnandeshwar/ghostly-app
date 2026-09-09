const TOKEN_KEY = "sessionToken";

/**
 * The session token is issued and signed by the server. The client only stores
 * and replays it — it can no longer mint its own identifier.
 *
 * Every access is guarded, because touching localStorage can throw rather than
 * return null: reading the property alone raises SecurityError when site data
 * is blocked (Chrome's "block all cookies", a sandboxed iframe without
 * allow-same-origin, Firefox with dom.storage.enabled off), and setItem raises
 * QuotaExceededError in older Safari private mode.
 *
 * Unguarded, that was fatal rather than degraded. getSessionToken runs inside
 * the axios request interceptor, so every HTTP request rejected; it also runs
 * in a SocketContext effect body, where the throw reached ErrorBoundary and
 * produced a permanent "Something broke" screen whose only action was a reload
 * that reproduced it.
 *
 * The fallback keeps the token in memory instead. That loses the session on
 * refresh, which is the correct trade: a working tab beats a dead one, and a
 * browser configured to block storage has asked not to be remembered.
 */
let memoryToken: string | null = null;

export function getSessionToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
    } catch {
        return memoryToken;
    }
}

export function setSessionToken(token: string): void {
    // Set first, so the token survives even if the write below throws.
    memoryToken = token;

    try {
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // Storage is unavailable; the in-memory copy is the session now.
    }
}

export function clearSessionToken(): void {
    memoryToken = null;

    try {
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Nothing to clear if storage was never reachable.
    }
}
