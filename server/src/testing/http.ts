/**
 * Minimal Express req/res doubles for middleware tests.
 *
 * Middlewares are the largest untested surface on the server, and none of them
 * need a live server to exercise -- they are plain functions over (req, res,
 * next). Spinning up an HTTP listener to test them would also drag in the
 * Redis-backed rate limiters, which never resolve outside a real connection.
 */

export interface FakeResponse {
    statusCode: number | null;
    body: unknown;
    headersSent: boolean;
    status(code: number): FakeResponse;
    json(payload: unknown): FakeResponse;
}

export function fakeRes(overrides: Partial<FakeResponse> = {}): FakeResponse {
    const res: FakeResponse = {
        statusCode: null,
        body: undefined,
        headersSent: false,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(payload: unknown) {
            res.body = payload;
            return res;
        },
        ...overrides
    };

    return res;
}

/**
 * A request whose `query` is a non-memoising getter, exactly as Express 5
 * defines it (`Object.defineProperty(req, "query", { get })` with no cache --
 * see node_modules/express/lib/request.js). A plain object here would let a
 * middleware appear to mutate `req.query` successfully when against a real
 * request it cannot.
 */
export function fakeReq(init: {
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, unknown>;
    params?: Record<string, string>;
    ip?: string;
    originalUrl?: string;
} = {}) {
    const headers = init.headers ?? {};

    const req: any = {
        body: init.body,
        params: init.params ?? {},
        ip: init.ip ?? "203.0.113.1",
        originalUrl: init.originalUrl ?? "/api/v1/test",
        get(name: string) {
            return headers[name.toLowerCase()];
        }
    };

    if (init.query) {
        // Re-parsed on every access, like the real thing.
        const source = init.query;
        Object.defineProperty(req, "query", {
            configurable: true,
            enumerable: true,
            get: () => ({ ...source })
        });
    }

    return req;
}

/** Records whether next() ran, and with what. */
export function fakeNext() {
    const calls: unknown[] = [];

    // Defined with defineProperties rather than Object.assign: assign copies a
    // getter's current *value*, which would freeze `called` at false forever.
    const next = (err?: unknown) => {
        calls.push(err);
    };

    return Object.defineProperties(next, {
        calls: { get: () => calls },
        called: { get: () => calls.length > 0 },
        callCount: { get: () => calls.length },
        error: { get: () => calls[0] }
    }) as typeof next & {
        readonly calls: unknown[];
        readonly called: boolean;
        readonly callCount: number;
        readonly error: unknown;
    };
}
