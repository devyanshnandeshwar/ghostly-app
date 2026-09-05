/**
 * Which match a socket is currently in.
 *
 * This lived in Redis so a second instance could read it. The deployment runs a
 * single instance, and a spin-down destroys every socket, so a Redis row
 * describing a socket reliably outlives the socket it describes -- it is
 * garbage referring to something that no longer exists. Holding it in process
 * also takes a Redis round trip off every chat message and every typing event,
 * and removes the failure mode where an unreachable Redis made the room check
 * answer "not authorised" and drop messages silently.
 *
 * The interface is kept so a Redis-backed implementation can return if the
 * deployment ever runs more than one instance.
 */

export interface ActiveMatch {
    partnerSessionId: string;
    roomId: string;
}

export interface PresenceStore {
    set(socketId: string, match: ActiveMatch): Promise<void>;
    get(socketId: string): Promise<ActiveMatch | null>;
    clear(socketId: string): Promise<void>;
}

/**
 * Long enough to outlive any real conversation. This is a safety net, not the
 * normal path: sockets are cleared on disconnect. It exists because a process
 * that misses a disconnect handler would otherwise hold the entry forever,
 * which is the leak Redis's TTL used to cover.
 */
export const PRESENCE_TTL_MS = 4 * 60 * 60 * 1000;

interface Entry {
    match: ActiveMatch;
    expiresAt: number;
}

export class InMemoryPresenceStore implements PresenceStore {
    private entries = new Map<string, Entry>();

    // Injectable clock so expiry is testable without sleeping.
    constructor(private now: () => number = Date.now) {}

    get size(): number {
        return this.entries.size;
    }

    async set(socketId: string, match: ActiveMatch): Promise<void> {
        // Swept on write rather than by a timer: a periodic sweep is the kind of
        // idle poller this refactor exists to remove, and writes are rare
        // (once per match) while reads are on the hot path.
        this.sweep();
        this.entries.set(socketId, { match, expiresAt: this.now() + PRESENCE_TTL_MS });
    }

    async get(socketId: string): Promise<ActiveMatch | null> {
        const entry = this.entries.get(socketId);
        if (!entry) return null;

        if (entry.expiresAt <= this.now()) {
            this.entries.delete(socketId);
            return null;
        }

        return entry.match;
    }

    async clear(socketId: string): Promise<void> {
        this.entries.delete(socketId);
    }

    private sweep(): void {
        const now = this.now();
        for (const [socketId, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(socketId);
        }
    }
}
