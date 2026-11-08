import { beforeEach, expect, mock, test } from "bun:test";
import { FakeIo, FakeSocket, unhandledRejectionsDuring } from "../testing/fakeSocket";

let fail = false;
let active = true;
mock.module("../services/presence.service", () => ({
  getActiveMatch: async () => active ? { partnerSessionId: "partner", roomId: "room" } : null,
  clearActiveMatch: async () => {},
}));
mock.module("../services/report.service", () => ({
  createReport: async () => { if (fail) throw new Error("database details must not leak"); return { _id: "report" }; },
}));
import { reportSocketHandler } from "./report.socket";

beforeEach(() => { fail = false; active = true; });

async function submit() {
  const socket = new FakeSocket("reporter", { session: { _id: "session" } });
  socket.join("room");
  reportSocketHandler(new FakeIo([socket]) as never, socket as never);
  let result: unknown;
  await unhandledRejectionsDuring(() => socket.dispatch("report-user", { reason: "Harassment", description: "note" }, (value: unknown) => { result = value; }));
  return { result, socket };
}

test("acknowledges a stored report without emitting a queue error", async () => {
  const { result, socket } = await submit();
  expect(result).toEqual({ ok: true });
  expect(socket.lastEmit("report-submitted")).toBeDefined();
  expect(socket.lastEmit("queue-error")).toBeUndefined();
  expect(socket.rooms.has("room")).toBe(false);
});

test("a failed report returns a safe error and preserves the chat", async () => {
  fail = true;
  const { result, socket } = await submit();
  expect(result).toEqual({ ok: false, error: "Could not submit that report. Please try again." });
  expect(socket.lastEmit("queue-error")).toBeUndefined();
  expect(socket.rooms.has("room")).toBe(true);
});

test("a report without an active match is explicitly refused", async () => {
  active = false;
  const { result } = await submit();
  expect(result).toEqual({ ok: false, error: "This conversation has ended. The report was not sent." });
});
