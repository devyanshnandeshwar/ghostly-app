import { describe, expect, test, beforeEach, mock } from "bun:test";
import { FakeSocket, FakeIo, unhandledRejectionsDuring } from "../testing/fakeSocket";

// End-to-end version of the safeHandler regression, against the real handlers.
//
// Every event a client can send is dispatched here with no payload at all and
// with a range of hostile shapes. Before the fix, the first of these took the
// process down: Socket.IO calls listeners inside process.nextTick with no
// try/catch, so a destructure of undefined inside an async handler became an
// unhandled rejection and the runtime exited non-zero -- dropping every other
// connected user.

let activeMatch: { partnerSessionId: string; roomId: string } | null = null;

mock.module("../services/presence.service", () => ({
    getActiveMatch: async () => activeMatch,
    setActiveMatch: async () => {},
    clearActiveMatch: async () => {}
}));

mock.module("../services/report.service", () => ({
    createReport: async () => ({ _id: "report-1" })
}));

// A static import is safe: mock.module patches the live binding even for a
// module already resolved.
import { chatSocketHandler } from "./chat.socket";
import { reportSocketHandler } from "./report.socket";

/** Everything a client can put on the wire that is not a well-formed payload. */
const HOSTILE_PAYLOADS: [string, unknown][] = [
    ["no argument at all", undefined],
    ["null", null],
    ["a bare string", "room-1"],
    ["a number", 42],
    ["a boolean", true],
    ["an array", []],
    ["an object with nothing in it", {}],
    ["an object whose fields are the wrong types", { roomId: 1, message: {}, iv: [] }],
    ["an object with a null prototype", Object.create(null)],
    ["a prototype-pollution attempt", JSON.parse('{"__proto__":{"polluted":true}}')]
];

function wire() {
    const socket = new FakeSocket("socket-1", { session: { _id: "sess-1" } });
    const io = new FakeIo([socket]);
    chatSocketHandler(io as any, socket as any);
    reportSocketHandler(io as any, socket as any);
    return { socket, io };
}

beforeEach(() => {
    activeMatch = { partnerSessionId: "sess-2", roomId: "room-1" };
});

const CLIENT_EVENTS = ["exchange-key", "join-room", "send-message", "typing", "report-user"];

describe("a malformed payload cannot end the process", () => {
    for (const event of CLIENT_EVENTS) {
        for (const [label, payload] of HOSTILE_PAYLOADS) {
            test(`${event} survives ${label}`, async () => {
                const { socket } = wire();

                const rejections = await unhandledRejectionsDuring(() => {
                    socket.dispatch(event, payload);
                });

                expect(rejections).toEqual([]);
            });
        }
    }

    // The literal exploit: emit with no argument whatsoever, which is what
    // `socket.emit("send-message")` sends.
    test("every client event survives being emitted with no argument", async () => {
        const { socket } = wire();

        const rejections = await unhandledRejectionsDuring(() => {
            for (const event of CLIENT_EVENTS) socket.dispatch(event);
        });

        expect(rejections).toEqual([]);
    });

    test("a hostile payload is ignored rather than acted on", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() => socket.dispatch("send-message", undefined));

        expect(socket.roomEmits).toEqual([]);
    });

    test("prototype pollution through a payload does not leak onto Object", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() =>
            socket.dispatch("send-message", JSON.parse('{"__proto__":{"polluted":true}}'))
        );

        expect(({} as any).polluted).toBeUndefined();
    });
});

describe("well-formed payloads still work", () => {
    test("a valid message is relayed to the room", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() =>
            socket.dispatch("send-message", { roomId: "room-1", message: "cipher", iv: "aXY=" })
        );

        expect(socket.roomEmits).toEqual([
            { room: "room-1", event: "receive-message", args: [{ message: "cipher", iv: "aXY=" }] }
        ]);
    });

    test("a message for a room the caller is not matched into is dropped", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() =>
            socket.dispatch("send-message", { roomId: "someone-elses-room", message: "c", iv: "i" })
        );

        expect(socket.roomEmits).toEqual([]);
    });

    test("an oversized ciphertext is dropped rather than fanned out", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() =>
            socket.dispatch("send-message", {
                roomId: "room-1",
                message: "x".repeat(8 * 1024 + 1),
                iv: "aXY="
            })
        );

        expect(socket.roomEmits).toEqual([]);
    });

    test("a valid typing signal is relayed", async () => {
        const { socket } = wire();

        await unhandledRejectionsDuring(() =>
            socket.dispatch("typing", { roomId: "room-1", isTyping: true })
        );

        expect(socket.roomEmits).toEqual([
            { room: "room-1", event: "partner-typing", args: [true] }
        ]);
    });
});
