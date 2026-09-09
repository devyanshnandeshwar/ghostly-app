import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { getSessionToken, setSessionToken, clearSessionToken } from "./auth";

// The regression this guards: these three functions touched localStorage with
// no guard, and touching localStorage can THROW rather than return null --
// reading the property alone raises SecurityError when site data is blocked
// (Chrome "block all cookies", a sandboxed iframe, Firefox with
// dom.storage.enabled off).
//
// That was not a degraded experience, it was a dead app. getSessionToken runs
// inside the axios request interceptor, so every HTTP request rejected, and it
// runs in a SocketContext effect body, where the throw reached ErrorBoundary and
// produced a permanent "Something broke" screen whose only action was a reload
// that reproduced it.

const real = Object.getOwnPropertyDescriptor(window, "localStorage");

/** Replaces localStorage with one that throws on every access, as a locked-down browser does. */
function blockStorage() {
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
            throw new DOMException("The operation is insecure.", "SecurityError");
        }
    });
}

/** Storage that reads fine but refuses writes, as older Safari private mode does. */
function readOnlyStorage(initial: Record<string, string> = {}) {
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            getItem: (k: string) => initial[k] ?? null,
            setItem: () => {
                throw new DOMException("QuotaExceededError", "QuotaExceededError");
            },
            removeItem: () => {
                throw new DOMException("QuotaExceededError", "QuotaExceededError");
            }
        }
    });
}

beforeEach(() => {
    if (real) Object.defineProperty(window, "localStorage", real);
    clearSessionToken();
});

afterEach(() => {
    if (real) Object.defineProperty(window, "localStorage", real);
});

describe("with working storage", () => {
    test("round-trips a token", () => {
        setSessionToken("tok-1");

        expect(getSessionToken()).toBe("tok-1");
    });

    test("returns null before anything is stored", () => {
        expect(getSessionToken()).toBeNull();
    });

    test("clear removes it", () => {
        setSessionToken("tok-1");
        clearSessionToken();

        expect(getSessionToken()).toBeNull();
    });

    test("a later token replaces an earlier one", () => {
        setSessionToken("tok-1");
        setSessionToken("tok-2");

        expect(getSessionToken()).toBe("tok-2");
    });

    test("persists under the key the app has always used", () => {
        setSessionToken("tok-1");

        expect(localStorage.getItem("sessionToken")).toBe("tok-1");
    });
});

describe("with storage blocked entirely", () => {
    // The bug: this threw, and it is called from the axios request interceptor.
    test("reading does not throw", () => {
        blockStorage();

        expect(() => getSessionToken()).not.toThrow();
    });

    test("reading reports no token rather than failing the request", () => {
        blockStorage();

        expect(getSessionToken()).toBeNull();
    });

    test("writing does not throw", () => {
        blockStorage();

        expect(() => setSessionToken("tok-1")).not.toThrow();
    });

    test("clearing does not throw", () => {
        blockStorage();

        expect(() => clearSessionToken()).not.toThrow();
    });

    // The session still has to work for the life of the tab, or the user is
    // authenticated for exactly one request and then anonymous again.
    test("the session survives in memory for the rest of the tab", () => {
        blockStorage();

        setSessionToken("tok-1");

        expect(getSessionToken()).toBe("tok-1");
    });

    test("clearing still signs the user out", () => {
        blockStorage();
        setSessionToken("tok-1");

        clearSessionToken();

        expect(getSessionToken()).toBeNull();
    });
});

describe("with storage that reads but refuses writes", () => {
    test("a write that throws still leaves the token usable", () => {
        readOnlyStorage();

        setSessionToken("tok-1");

        expect(getSessionToken()).toBe("tok-1");
    });

    test("an already-stored token is still read", () => {
        readOnlyStorage({ sessionToken: "stored-tok" });

        expect(getSessionToken()).toBe("stored-tok");
    });
});
