import type { Gender } from "../types/User";

/**
 * The matchmaking queue.
 *
 * Previously six Redis lists holding JSON. Every join read a whole list back,
 * parsed each element, and re-serialised the joiner's entire pastMatches array
 * into the stored value; every disconnect either hit a reverse-index key or
 * scanned all six lists; and a 60-second poller swept entries whose socket had
 * died with its process.
 *
 * None of that survives contact with the deployment this now targets. One
 * instance means nothing else can read the queue, and a spin-down destroys
 * every socket in it -- so a queue that outlives the process holds nothing but
 * references to sockets that no longer exist. In memory, removal is a map
 * delete rather than a list scan, pastMatches is a reference rather than a
 * serialised copy, and the reconciler has nothing left to reconcile.
 *
 * The interface stays so a Redis implementation can return if the deployment
 * ever runs more than one instance.
 */

export type Preference = "male" | "female" | "any";

export interface QueueEntry {
    socketId: string;
    sessionId: string;
    gender: Gender;
    preference: Preference;
    pastMatches: string[];
    nickname: string;
    bio: string;
    queuedAt: number;
}

export interface QueueStore {
    claimMatch(candidate: QueueEntry): QueueEntry | null;
    enqueue(entry: QueueEntry): void;
    removeBySocket(socketId: string): boolean;
    removeBySession(sessionId: string): boolean;
}

/**
 * An entry older than this is treated as dead. It replaces the periodic
 * reconcile: rather than sweeping on a timer, a stale entry is dropped the
 * moment anyone looks at it.
 */
const MAX_WAIT_MS = 30 * 60 * 1000;

function queueKey(gender: Gender, preference: Preference): string {
    return `${gender}:${preference}`;
}

/**
 * Which buckets a joiner should search, in preference order. Preserved exactly
 * from the Redis implementation: a bucket is keyed by what its occupants ARE
 * and what they WANT, so the joiner looks for people who want them.
 */
function bucketsToSearch(gender: Gender, preference: Preference): string[] {
    if (preference !== "any") {
        return [queueKey(preference, gender), queueKey(preference, "any")];
    }

    const other: Gender = gender === "male" ? "female" : "male";
    return [
        queueKey(other, gender),
        queueKey(gender, gender),
        queueKey(other, "any"),
        queueKey(gender, "any")
    ];
}

export class InMemoryQueueStore implements QueueStore {
    /** bucket -> sessionId -> entry. Insertion order gives FIFO per bucket. */
    private buckets = new Map<string, Map<string, QueueEntry>>();
    /** Reverse indexes, so removal never scans. */
    private bySession = new Map<string, QueueEntry>();
    private bySocket = new Map<string, QueueEntry>();

    constructor(private now: () => number = Date.now) {}

    get size(): number {
        return this.bySession.size;
    }

    get maxWaitMs(): number {
        return MAX_WAIT_MS;
    }

    enqueue(entry: QueueEntry): void {
        // A session may only hold one place in the queue. Re-joining after a
        // reconnect must replace the old entry, not sit alongside it.
        this.removeBySession(entry.sessionId);

        const key = queueKey(entry.gender, entry.preference);
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = new Map();
            this.buckets.set(key, bucket);
        }

        bucket.set(entry.sessionId, entry);
        this.bySession.set(entry.sessionId, entry);
        this.bySocket.set(entry.socketId, entry);
    }

    claimMatch(candidate: QueueEntry): QueueEntry | null {
        const cutoff = this.now() - MAX_WAIT_MS;

        for (const key of bucketsToSearch(candidate.gender, candidate.preference)) {
            const bucket = this.buckets.get(key);
            if (!bucket || bucket.size === 0) continue;

            for (const entry of [...bucket.values()]) {
                if (entry.queuedAt <= cutoff) {
                    // Stale: its socket is almost certainly gone. Drop it here
                    // rather than on a timer.
                    this.remove(entry);
                    continue;
                }

                if (entry.sessionId === candidate.sessionId) {
                    // A stale copy of ourselves, left by a reconnect.
                    this.remove(entry);
                    continue;
                }

                // Either side having met the other before is disqualifying.
                if (
                    candidate.pastMatches.includes(entry.sessionId) ||
                    entry.pastMatches.includes(candidate.sessionId)
                ) {
                    continue;
                }

                this.remove(entry);
                return entry;
            }
        }

        return null;
    }

    removeBySocket(socketId: string): boolean {
        const entry = this.bySocket.get(socketId);
        if (!entry) return false;
        this.remove(entry);
        return true;
    }

    removeBySession(sessionId: string): boolean {
        const entry = this.bySession.get(sessionId);
        if (!entry) return false;
        this.remove(entry);
        return true;
    }

    private remove(entry: QueueEntry): void {
        this.buckets.get(queueKey(entry.gender, entry.preference))?.delete(entry.sessionId);
        this.bySession.delete(entry.sessionId);
        this.bySocket.delete(entry.socketId);
    }
}
