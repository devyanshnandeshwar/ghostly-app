import { describe, expect, test } from "bun:test";
import { safeHandler, isRecord } from "./safeHandler";
import { unhandledRejectionsDuring } from "../testing/fakeSocket";

// The regression this guards: chat.socket and report.socket destructured their
// payload in the parameter list --
//
//     socket.on("send-message", async ({ roomId, message, iv }) => {
//
// -- and Socket.IO invokes listeners inside a process.nextTick with no
// try/catch. `socket.emit("send-message")` with no argument therefore made that
// destructure throw inside an async function, producing an unhandled rejection,
// which Node and Bun both answer by exiting non-zero. One line from any
// authenticated client dropped every other connected user with it, and sessions
// are free to mint via /session/init.

describe("safeHandler", () => {
    test("passes arguments through and runs the handler", () => {
        const seen: unknown[] = [];
        safeHandler("e", (...args: unknown[]) => seen.push(args))("a", 1);

        expect(seen).toEqual([["a", 1]]);
    });

    test("returns the same shape whether or not the handler is async", async () => {
        expect(safeHandler("e", () => 1)()).toBeUndefined();
        expect(safeHandler("e", async () => 1)()).toBeUndefined();
    });

    test("swallows a synchronous throw rather than letting it escape", () => {
        const wrapped = safeHandler("e", () => {
            throw new Error("boom");
        });

        expect(() => wrapped()).not.toThrow();
    });

    // The one that matters. Without the wrapper this rejection is unhandled and
    // the process exits.
    test("contains an async rejection instead of leaving it unhandled", async () => {
        const wrapped = safeHandler("e", async () => {
            throw new Error("boom");
        });

        const rejections = await unhandledRejectionsDuring(() => wrapped());

        expect(rejections).toEqual([]);
    });

    test("contains the exact failure a bare destructure produces", async () => {
        const wrapped = safeHandler("send-message", async ({ roomId }: any) => roomId);

        const rejections = await unhandledRejectionsDuring(() => wrapped(undefined as any));

        expect(rejections).toEqual([]);
    });

    test("one failing call does not stop the next from running", () => {
        const wrapped = safeHandler("e", (ok: boolean) => {
            if (!ok) throw new Error("boom");
            return "ran";
        });
        const seen: string[] = [];

        wrapped(false);
        safeHandler("e", () => seen.push("second"))();

        expect(seen).toEqual(["second"]);
    });
});

describe("isRecord", () => {
    test("accepts a plain object", () => {
        expect(isRecord({ roomId: "r" })).toBe(true);
    });

    test.each([undefined, null, "str", 7, true])("rejects %p", (value) => {
        expect(isRecord(value)).toBe(false);
    });

    // Excluded deliberately: `const { roomId } = []` yields undefined rather
    // than throwing, so an array would slip past a plain typeof check and fail
    // later, further from the cause.
    test("rejects an array, which destructures to undefined rather than throwing", () => {
        expect(isRecord([])).toBe(false);
    });
});
