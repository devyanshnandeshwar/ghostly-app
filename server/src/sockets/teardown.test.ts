import { describe, expect, test, beforeEach, mock } from "bun:test";
import { FakeSocket, FakeIo, unhandledRejectionsDuring } from "../testing/fakeSocket";

// Two regressions in how a conversation is torn down.
//
// The report path cleared presence and left the room but never cleared
// socket.data.publicKey, which handleLeaveChat clears on every other teardown
// path precisely because the key is per conversation. A key therefore survived
// onto the next match, and chat.socket's reconciliation loop served it to the
// new partner -- who then encrypted to a key the other side had already
// replaced. Nothing they sent could be decrypted.
//
// And next-match set a skip cooldown whether or not there was a chat to skip,
// so a client emitting it while idle or merely queued earned a 5-second block
// on its next search for leaving a conversation it was never in.

let activeMatch: { partnerSessionId: string; roomId: string } | null = null;
const cleared: string[] = [];

mock.module("../services/presence.service", () => ({
    getActiveMatch: async () => activeMatch,
    setActiveMatch: async () => {},
    clearActiveMatch: async (id: string) => {
        cleared.push(id);
    }
}));

mock.module("../services/report.service", () => ({
    createReport: async () => ({ _id: "report-1" })
}));

// A static import is safe: mock.module patches the live binding even for a
// module already resolved.
import { reportSocketHandler } from "./report.socket";
import { matchSocketHandler } from "./match.socket";

function pair() {
    const reporter = new FakeSocket("S_reporter", { session: { _id: "sess-1" } });
    const reported = new FakeSocket("S_reported", { session: { _id: "sess-2" } });
    reporter.join("room-1");
    reported.join("room-1");
    const io = new FakeIo([reporter, reported]);
    return { reporter, reported, io };
}

beforeEach(() => {
    activeMatch = { partnerSessionId: "sess-2", roomId: "room-1" };
    cleared.length = 0;
});

describe("reporting tears the conversation down completely", () => {
    test("clears the E2EE key on both sockets, not just presence", async () => {
        const { reporter, reported, io } = pair();
        reporter.data.publicKey = { kty: "EC", x: "reporter" };
        reported.data.publicKey = { kty: "EC", x: "reported" };
        reportSocketHandler(io as any, reporter as any);

        await unhandledRejectionsDuring(() =>
            reporter.dispatch("report-user", { reason: "Harassment", description: "no" })
        );

        expect(reporter.data.publicKey).toBeUndefined();
        expect(reported.data.publicKey).toBeUndefined();
    });

    test("still removes both from the room and clears presence", async () => {
        const { reporter, reported, io } = pair();
        reportSocketHandler(io as any, reporter as any);

        await unhandledRejectionsDuring(() =>
            reporter.dispatch("report-user", { reason: "Harassment" })
        );

        expect(reporter.rooms.has("room-1")).toBe(false);
        expect(reported.rooms.has("room-1")).toBe(false);
        expect(cleared).toContain("S_reporter");
        expect(cleared).toContain("S_reported");
    });

    test("tells the reported party the conversation ended", async () => {
        const { reporter, reported, io } = pair();
        reportSocketHandler(io as any, reporter as any);

        await unhandledRejectionsDuring(() =>
            reporter.dispatch("report-user", { reason: "Harassment" })
        );

        expect(reported.lastEmit("partner-disconnected")).toBeDefined();
    });

    test("a report with no active match does nothing", async () => {
        activeMatch = null;
        const { reporter, io } = pair();
        reportSocketHandler(io as any, reporter as any);

        await unhandledRejectionsDuring(() =>
            reporter.dispatch("report-user", { reason: "Harassment" })
        );

        expect(cleared).toEqual([]);
    });
});

describe("next-match cooldown", () => {
    function skipper(match: typeof activeMatch) {
        activeMatch = match;
        const socket = new FakeSocket("S_skip", { session: { _id: "sess-1" } });
        socket.join("room-1");
        const io = new FakeIo([socket]);
        matchSocketHandler(io as any, socket as any);
        return socket;
    }

    test("applies when a conversation was actually skipped", async () => {
        const socket = skipper({ partnerSessionId: "sess-2", roomId: "room-1" });

        await unhandledRejectionsDuring(() => socket.dispatch("next-match"));

        expect(socket.lastEmit("queue-cooldown")).toBeDefined();
    });

    // The bug: a cooldown for skipping a chat the client was never in.
    test("does not apply when there was no conversation", async () => {
        const socket = skipper(null);

        await unhandledRejectionsDuring(() => socket.dispatch("next-match"));

        expect(socket.lastEmit("queue-cooldown")).toBeUndefined();
    });

    test("leaving a chat never sets a cooldown", async () => {
        const socket = skipper({ partnerSessionId: "sess-2", roomId: "room-1" });

        await unhandledRejectionsDuring(() => socket.dispatch("leave-chat"));

        expect(socket.lastEmit("queue-cooldown")).toBeUndefined();
    });

    test("the partner is told which of the two it was", async () => {
        const socket = skipper({ partnerSessionId: "sess-2", roomId: "room-1" });

        await unhandledRejectionsDuring(() => socket.dispatch("next-match"));

        expect(socket.roomEmits.map((e) => e.event)).toContain("partner-skipped");
    });
});

describe("join-queue while already in a chat", () => {
    test("is refused rather than clobbering the current match", async () => {
        activeMatch = { partnerSessionId: "sess-2", roomId: "room-1" };
        const socket = new FakeSocket("S_a", { session: { _id: "sess-1" } });
        const io = new FakeIo([socket]);
        matchSocketHandler(io as any, socket as any);

        await unhandledRejectionsDuring(() => socket.dispatch("join-queue"));

        expect(socket.lastEmit("queue-error")?.args[0]).toMatch(/already in a chat/i);
    });
});
