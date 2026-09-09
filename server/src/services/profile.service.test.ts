import { describe, expect, test, beforeEach, mock } from "bun:test";

// updateProfile is the largest piece of pure validation on the server and had
// no tests at all -- blocked, in part, by an unused mongoose import that pulled
// the whole driver into anything that touched this file.
//
// The regression that matters most: the write defaulted the fields the caller
// did not send. `bio: bio || ""` and `preference: preference || "any"` meant a
// request carrying only a nickname blanked the bio and reset the gender filter
// to "any" -- silently discarding the setting the whole filter quota exists to
// meter, on an update that never mentioned it.

let writes: { sessionId: string; update: Record<string, unknown> }[] = [];

mock.module("./session.service", () => ({
    updateSession: async (sessionId: string, update: Record<string, unknown>) => {
        writes.push({ sessionId, update });
        return { _id: sessionId };
    }
}));

// A static import is safe: mock.module patches the live binding even for a
// module already resolved.
import { updateProfile } from "./profile.service";

beforeEach(() => {
    writes = [];
});

const lastUpdate = () => writes[writes.length - 1].update;

describe("partial updates", () => {
    test("a nickname-only update leaves the gender filter alone", async () => {
        await updateProfile("sess-1", { nickname: "Ada" } as any);

        expect(lastUpdate()).toEqual({ nickname: "Ada" });
        expect(lastUpdate()).not.toHaveProperty("preference");
    });

    test("a nickname-only update leaves the bio alone", async () => {
        await updateProfile("sess-1", { nickname: "Ada" } as any);

        expect(lastUpdate()).not.toHaveProperty("bio");
    });

    test("a preference that was sent is written", async () => {
        await updateProfile("sess-1", { nickname: "Ada", preference: "female" });

        expect(lastUpdate()).toEqual({ nickname: "Ada", preference: "female" });
    });

    // An explicit empty string is a deliberate clear, unlike an absent field.
    test("an explicitly empty bio clears it", async () => {
        await updateProfile("sess-1", { nickname: "Ada", bio: "" });

        expect(lastUpdate()).toEqual({ nickname: "Ada", bio: "" });
    });

    test("writes against the session it was given", async () => {
        await updateProfile("sess-42", { nickname: "Ada" } as any);

        expect(writes[0].sessionId).toBe("sess-42");
    });
});

describe("nickname validation", () => {
    test.each(["ab", "", "a".repeat(21)])("rejects %p", async (nickname) => {
        expect(updateProfile("sess-1", { nickname } as any)).rejects.toThrow(/3-20/);
    });

    test.each(["abc", "a".repeat(20)])("accepts %p at the boundary", async (nickname) => {
        expect(updateProfile("sess-1", { nickname } as any)).resolves.toBeDefined();
    });

    test("rejects a nickname that is not a string", async () => {
        expect(updateProfile("sess-1", { nickname: 12345 } as any)).rejects.toThrow();
    });

    // A NoSQL-injection shaped payload must not reach the model.
    test("rejects an object where a nickname belongs", async () => {
        expect(updateProfile("sess-1", { nickname: { $ne: null } } as any)).rejects.toThrow();
        expect(writes).toHaveLength(0);
    });

    test("requires at least one alphanumeric character", async () => {
        expect(updateProfile("sess-1", { nickname: "!!!!" } as any)).rejects.toThrow(/alphanumeric/);
    });

    test("carries a 400, so this is not reported as a server fault", async () => {
        await updateProfile("sess-1", { nickname: "ab" } as any).catch((err: any) => {
            expect(err.statusCode).toBe(400);
        });
    });
});

describe("bio validation", () => {
    test("rejects a bio over the limit", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", bio: "x".repeat(121) })
        ).rejects.toThrow(/120/);
    });

    test("accepts a bio exactly at the limit", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", bio: "x".repeat(120) })
        ).resolves.toBeDefined();
    });
});

describe("preference validation", () => {
    test.each(["male", "female", "any"])("accepts %p", async (preference) => {
        expect(updateProfile("sess-1", { nickname: "Ada", preference })).resolves.toBeDefined();
    });

    test("rejects anything else", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", preference: "everyone" })
        ).rejects.toThrow(/preference/i);
    });

    test("rejects an object, which would otherwise reach the query", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", preference: { $ne: null } } as any)
        ).rejects.toThrow();
    });
});

// The product does not want contact details handed between strangers, which is
// the entire point of an anonymous chat.
describe("contact details are refused", () => {
    test.each([
        ["a URL in the nickname", { nickname: "http://evil.com" }],
        ["a URL in the bio", { nickname: "Ada", bio: "find me at https://evil.com" }]
    ])("rejects %s", async (_label, data) => {
        expect(updateProfile("sess-1", data as any)).rejects.toThrow(/URL/i);
    });

    test("rejects an email in the bio", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", bio: "ada@example.com" })
        ).rejects.toThrow(/email/i);
    });

    test("rejects a phone number in the bio", async () => {
        expect(
            updateProfile("sess-1", { nickname: "Ada", bio: "call 5551234567" })
        ).rejects.toThrow(/phone/i);
    });

    test("nothing is written when validation refuses", async () => {
        await updateProfile("sess-1", { nickname: "Ada", bio: "ada@example.com" }).catch(() => {});

        expect(writes).toHaveLength(0);
    });
});

describe("robustness", () => {
    test("a missing body is a 400, not a crash", async () => {
        expect(updateProfile("sess-1", undefined as any)).rejects.toThrow(/3-20/);
    });
});
