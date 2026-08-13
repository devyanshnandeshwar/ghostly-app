const TOKEN_KEY = "sessionToken";

/**
 * The session token is issued and signed by the server. The client only stores
 * and replays it — it can no longer mint its own identifier.
 */
export function getSessionToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}
