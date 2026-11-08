import { beforeEach, expect, mock, test } from "bun:test";

let stored = false;
let failCounters = false;
let failModeration = false;
let quota = 0;
let writes = 0;
let moderationChecks = 0;
const report = { _id: "report", roomId: "room" };

mock.module("../models/Report", () => ({ Report: {
  findOne: async () => stored ? report : null,
  countDocuments: async () => quota,
  create: async () => { stored = true; writes++; return report; },
  distinct: async () => { moderationChecks++; if (failModeration) throw new Error("moderation unavailable"); return ["a", "b", "c"]; },
} }));
mock.module("./session.service", () => ({ updateSession: async (_id: string, update: Record<string, unknown>) => {
  if (failCounters && "$inc" in update) throw new Error("counter unavailable");
} }));
import { createReport } from "./report.service";

beforeEach(() => { stored = false; failCounters = false; failModeration = false; quota = 0; writes = 0; moderationChecks = 0; });

test("counter failures do not deny a stored report or skip moderation checks", async () => {
  failCounters = true;
  expect(await createReport("reporter", "partner", "Harassment", "room")).toHaveProperty("roomId", "room");
  expect(stored).toBe(true);
  expect(moderationChecks).toBe(1);
});

test("moderation failure does not claim that a durable report was rejected", async () => {
  failModeration = true;
  expect(await createReport("reporter", "partner", "Harassment", "room")).toHaveProperty("roomId", "room");
  expect(writes).toBe(1);
});

test("retry returns the stored report even after the reporting allowance is spent", async () => {
  await createReport("reporter", "partner", "Harassment", "room");
  quota = 3;
  expect(await createReport("reporter", "partner", "Harassment", "room")).toHaveProperty("roomId", "room");
  expect(writes).toBe(1);
});
