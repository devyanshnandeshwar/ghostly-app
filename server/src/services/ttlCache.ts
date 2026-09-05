/**
 * A small in-process cache with per-entry expiry.
 *
 * Used where the previous Redis-backed cache existed only to share state
 * between instances. With a single instance that indirection bought nothing and
 * cost a round trip on every read.
 */
export class TtlCache<T> {
    private entries = new Map<string, { value: T; expiresAt: number }>();

    constructor(
        private ttlMs: number,
        private now: () => number = Date.now
    ) {}

    get size(): number {
        return this.entries.size;
    }

    get(key: string): T | null {
        const entry = this.entries.get(key);
        if (!entry) return null;

        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return null;
        }

        return entry.value;
    }

    set(key: string, value: T): void {
        // Swept on write, not by a timer: writes are far rarer than reads and a
        // periodic sweep is the kind of idle work this codebase is shedding.
        this.sweep();
        this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    private sweep(): void {
        const now = this.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.entries.delete(key);
        }
    }
}
