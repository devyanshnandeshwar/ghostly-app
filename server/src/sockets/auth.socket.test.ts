import { describe, expect, test, beforeEach, mock } from "bun:test";
import { issueSessionToken } from "../utils/token";
import { socketAuth } from "./auth.socket";

// A static import is safe: mock.module patches the live binding even for a
// module already resolved, so the module under test picks up the fake either way.

// socketAuth is the door to every realtime feature, and nothing tested it. The
// revocation branch matters most: verifySession rejects a stale tokenVersion on
// the HTTP path, and if the socket path ever stopped doing the same, logging out
// would close the API while leaving the user's chat socket wide open -- i.e.
// revocation would half work, which is the failure mode you never notice.

let stored: { _id: string; deviceId: string; tokenVersion: number } | null = null;
let lookupError: Error | null = null;
let touched: string[] = [];
let touchError: Error | null = null;

mock.module("../services/session.service", () => ({
    getAuthSession: async (deviceId: string) => {
        if (lookupError) throw lookupError;
        return stored && stored.deviceId === deviceId ? stored : null;
    },
    touchLastActive: async (id: string) => {
        if (touchError) throw touchError;
        touched.push(id);
    }
}));


beforeEach(() => {
    stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 0 };
    lookupError = null;
    touchError = null;
    touched = [];
});

function fakeSocket(token?: unknown) {
    return { handshake: { auth: token === undefined ? {} : { token } }, data: {} as any };
}

async function run(token?: unknown) {
    const socket = fakeSocket(token);
    let err: Error | undefined;
    await socketAuth(socket as any, (e?: Error) => {
        err = e;
    });
    return { socket, err };
}

describe("socketAuth", () => {
    test("refuses a handshake with no token", async () => {
        const { err } = await run();

        expect(err?.message).toBe("Session token missing");
    });

    test("refuses a handshake with an empty token", async () => {
        const { err } = await run("");

        expect(err?.message).toBe("Session token missing");
    });

    test("refuses a token this server did not sign", async () => {
        const { err } = await run("v1.deadbeef.forged");

        expect(err?.message).toBe("Invalid session");
    });

    test("refuses a validly signed token for a session that no longer exists", async () => {
        stored = null;

        const { err } = await run(issueSessionToken("device-1"));

        expect(err?.message).toBe("Invalid session");
    });

    // The revocation check. If this regresses, a leaked credential keeps a live
    // socket -- and therefore matchmaking and chat -- after the user signs out.
    test("refuses a token whose version has been revoked", async () => {
        stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 4 };

        const { err } = await run(issueSessionToken("device-1", { version: 3 }));

        expect(err?.message).toBe("Session expired");
    });

    test("refuses a token claiming a version ahead of the stored one", async () => {
        stored = { _id: "sess-1", deviceId: "device-1", tokenVersion: 1 };

        const { err } = await run(issueSessionToken("device-1", { version: 9 }));

        expect(err?.message).toBe("Session expired");
    });

    test("admits a current token and attaches the session", async () => {
        const { socket, err } = await run(issueSessionToken("device-1", { version: 0 }));

        expect(err).toBeUndefined();
        expect(socket.data.session).toEqual({
            _id: "sess-1",
            deviceId: "device-1",
            tokenVersion: 0
        });
    });

    test("counts a successful handshake as activity", async () => {
        await run(issueSessionToken("device-1", { version: 0 }));

        expect(touched).toEqual(["sess-1"]);
    });

    // touchLastActive is fire-and-forget by design; a failure there must not
    // cost the user their connection.
    test("still admits the socket when recording activity fails", async () => {
        touchError = new Error("redis down");

        const { err } = await run(issueSessionToken("device-1", { version: 0 }));

        expect(err).toBeUndefined();
    });

    test("reports a lookup failure as a generic refusal rather than throwing", async () => {
        lookupError = new Error("mongodb://admin:hunter2@host unreachable");

        const { err } = await run(issueSessionToken("device-1"));

        expect(err?.message).toBe("Socket authentication failed");
        expect(err?.message).not.toContain("hunter2");
    });
});
