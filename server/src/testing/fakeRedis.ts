/**
 * The slice of the node-redis surface that server/src actually calls.
 *
 * Time is virtual: call advance() instead of sleeping, so TTL behaviour is
 * deterministic and a test that cares about expiry costs no wall-clock time.
 *
 * Individual commands can be made to fail with failCommand(). Several places in
 * src/ document a deliberate behaviour when Redis is unreachable -- quota reads
 * degrade to zero use, the lastActive throttle gives up -- and none of it could
 * be tested while every command always succeeded. A dropped EXPIRE in
 * particular is what used to strand a quota key with no expiry at all.
 */

type Entry = { value: string | string[]; expiresAt: number | null };

export class FakeRedis {
    private store = new Map<string, Entry>();
    private failing = new Set<string>();
    now = 0;
    isOpen = true;

    reset() {
        this.store.clear();
        this.failing.clear();
        this.now = 0;
        this.isOpen = true;
    }

    /** Make one command reject, the way a client does when the link drops. */
    failCommand(name: string) {
        this.failing.add(name);
    }

    /** Let a previously failing command work again. */
    healCommand(name: string) {
        this.failing.delete(name);
    }

    private guard(name: string) {
        if (this.failing.has(name)) {
            throw new Error(`ECONNRESET: ${name} failed`);
        }
    }

    /** Direct store access, for setting up states a normal call cannot reach. */
    seed(key: string, value: string, expiresAt: number | null = null) {
        this.store.set(key, { value, expiresAt });
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
        this.guard("get");
        return this.str(key);
    }

    async set(key: string, value: string, opts?: { NX?: boolean; EX?: number }) {
        this.guard("set");
        if (opts?.NX && this.live(key) !== undefined) return null;
        this.store.set(key, {
            value: String(value),
            expiresAt: opts?.EX != null ? this.now + opts.EX * 1000 : null
        });
        return "OK";
    }

    async setEx(key: string, seconds: number, value: string) {
        this.guard("setEx");
        this.store.set(key, { value: String(value), expiresAt: this.now + seconds * 1000 });
        return "OK";
    }

    async del(key: string) {
        this.guard("del");
        if (this.live(key) === undefined) return 0;
        this.store.delete(key);
        return 1;
    }

    async incr(key: string) {
        this.guard("incr");
        const current = this.str(key);
        const next = (current === null ? 0 : parseInt(current, 10)) + 1;
        const existing = this.live(key);
        this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
        return next;
    }

    async expire(key: string, seconds: number) {
        this.guard("expire");
        const entry = this.live(key);
        if (!entry) return 0;
        entry.expiresAt = this.now + seconds * 1000;
        return 1;
    }

    async ttl(key: string) {
        this.guard("ttl");
        const entry = this.live(key);
        if (!entry) return -2; // no such key
        if (entry.expiresAt === null) return -1; // no expiry
        return Math.ceil((entry.expiresAt - this.now) / 1000);
    }
}
