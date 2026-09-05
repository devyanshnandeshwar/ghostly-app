/**
 * The slice of the node-redis surface that server/src actually calls.
 *
 * Time is virtual: call advance() instead of sleeping, so TTL behaviour is
 * deterministic and a test that cares about expiry costs no wall-clock time.
 */

type Entry = { value: string | string[]; expiresAt: number | null };

export class FakeRedis {
    private store = new Map<string, Entry>();
    now = 0;
    isOpen = true;

    reset() {
        this.store.clear();
        this.now = 0;
        this.isOpen = true;
    }

    advance(ms: number) {
        this.now += ms;
    }

    private live(key: string): Entry | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
            this.store.delete(key);
            return undefined;
        }
        return entry;
    }

    private str(key: string): string | null {
        const entry = this.live(key);
        if (!entry) return null;
        if (Array.isArray(entry.value)) throw new Error(`WRONGTYPE ${key} holds a list`);
        return entry.value;
    }

    async get(key: string) {
        return this.str(key);
    }

    async set(key: string, value: string, opts?: { NX?: boolean; EX?: number }) {
        if (opts?.NX && this.live(key) !== undefined) return null;
        this.store.set(key, {
            value: String(value),
            expiresAt: opts?.EX != null ? this.now + opts.EX * 1000 : null
        });
        return "OK";
    }

    async setEx(key: string, seconds: number, value: string) {
        this.store.set(key, { value: String(value), expiresAt: this.now + seconds * 1000 });
        return "OK";
    }

    async del(key: string) {
        if (this.live(key) === undefined) return 0;
        this.store.delete(key);
        return 1;
    }

    async incr(key: string) {
        const current = this.str(key);
        const next = (current === null ? 0 : parseInt(current, 10)) + 1;
        const existing = this.live(key);
        this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
        return next;
    }

    async expire(key: string, seconds: number) {
        const entry = this.live(key);
        if (!entry) return 0;
        entry.expiresAt = this.now + seconds * 1000;
        return 1;
    }

    async ttl(key: string) {
        const entry = this.live(key);
        if (!entry) return -2; // no such key
        if (entry.expiresAt === null) return -1; // no expiry
        return Math.ceil((entry.expiresAt - this.now) / 1000);
    }
}
