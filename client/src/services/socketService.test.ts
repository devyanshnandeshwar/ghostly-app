import { describe, expect, test, beforeEach, vi } from "vitest";

// The regression this guards: connect() guarded on `this.socket.connected`, not
// on the socket existing. A call made while the socket was mid-reconnect --
// precisely when a reconnect is in flight -- fell through and built a second
// socket, overwriting the first WITHOUT disconnecting it. The orphan kept its
// own reconnection loop and its own server-side session for the life of the tab.
//
// Reachable in ordinary use: SocketContext's effect depends on [session],
// refreshSession() allocates a new object every call, and MatchContext calls it
// on every match. A match landing during a network hiccup therefore gave the
// user two live sockets and duplicate deliveries of every event.

type AuthCallback = (cb: (data: { token: string }) => void) => void;
interface FakeOptions {
    auth: AuthCallback;
    transports: string[];
    reconnectionAttempts: number;
}
interface FakeSocket {
    connected: boolean;
    disconnected: boolean;
    on: ReturnType<typeof vi.fn>;
    disconnect(): void;
}

const created: { url: string; opts: FakeOptions }[] = [];

vi.mock("socket.io-client", () => ({
    io: (url: string, opts: FakeOptions): FakeSocket => {
        const socket: FakeSocket = {
            connected: false,
            disconnected: false,
            on: vi.fn(),
            disconnect() {
                this.disconnected = true;
            }
        };
        created.push({ url, opts });
        return socket;
    }
}));

vi.mock("../utils/auth", () => ({
    getSessionToken: () => currentToken
}));

let currentToken: string | null = "tok-current";

const { socketService } = await import("./socketService");

beforeEach(() => {
    created.length = 0;
    currentToken = "tok-current";
    socketService.disconnect();
});

describe("connect", () => {
    test("creates a socket the first time", () => {
        socketService.connect("http://x", "tok");

        expect(created).toHaveLength(1);
    });

    test("reuses the existing socket rather than building a second", () => {
        const first = socketService.connect("http://x", "tok");
        const second = socketService.connect("http://x", "tok");

        expect(second).toBe(first);
        expect(created).toHaveLength(1);
    });

    // The bug: `connected` is false for the whole of a reconnect.
    test("does not orphan a socket that is mid-reconnect", () => {
        const first = socketService.connect("http://x", "tok");
        (first as unknown as FakeSocket).connected = false;

        const second = socketService.connect("http://x", "tok");

        expect(second).toBe(first);
        expect(created).toHaveLength(1);
    });

    test("builds a fresh socket after an explicit disconnect", () => {
        socketService.connect("http://x", "tok");
        socketService.disconnect();
        socketService.connect("http://x", "tok");

        expect(created).toHaveLength(2);
    });
});

describe("handshake credentials", () => {
    const authOf = (i = 0) => created[i].opts.auth;

    test("auth is a callback, so it is re-read on every reconnect", () => {
        socketService.connect("http://x", "tok");

        expect(typeof authOf()).toBe("function");
    });

    // The point of the callback: a token reissued by /session/init must be the
    // one presented, or the reconnect handshake fails for a reason nothing
    // surfaces and the app just stops working.
    test("a reconnect presents the current token, not the one captured at connect", () => {
        socketService.connect("http://x", "tok-original");

        currentToken = "tok-reissued";
        let presented: { token: string } | undefined;
        authOf()((data: { token: string }) => (presented = data));

        expect(presented).toEqual({ token: "tok-reissued" });
    });

    test("falls back to the token it was given when storage has none", () => {
        socketService.connect("http://x", "tok-passed");

        currentToken = null;
        let presented: { token: string } | undefined;
        authOf()((data: { token: string }) => (presented = data));

        expect(presented).toEqual({ token: "tok-passed" });
    });
});

describe("disconnect", () => {
    test("tears the socket down and forgets it", () => {
        const socket = socketService.connect("http://x", "tok");

        socketService.disconnect();

        expect((socket as unknown as FakeSocket).disconnected).toBe(true);
        expect(socketService.getSocket()).toBeNull();
    });

    test("is safe to call when nothing is connected", () => {
        expect(() => socketService.disconnect()).not.toThrow();
    });
});
