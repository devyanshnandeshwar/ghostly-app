import { describe, expect, test } from "bun:test";
import { xssMiddleware } from "./xss.middleware";
import { fakeReq, fakeNext } from "../testing/http";

// The regression this guards: in Express 5, req.query is a getter that
// re-parses the query string on EVERY access and returns a fresh object each
// time -- there is no memoisation (express/lib/request.js defines it with
// Object.defineProperty and only a `get`).
//
// So the loop that used to live here --
//
//     for (const key in req.query) req.query[key] = sanitize(req.query[key]);
//
// -- read one throwaway object and wrote into a second. It did not throw. It
// simply did nothing, and every later reader got raw input, while the file's
// comment asserted the opposite.
//
// fakeReq models query as that same non-memoising getter, so a plain object
// cannot make this test pass by accident.

const run = (req: any) => {
    const next = fakeNext();
    xssMiddleware(req, {} as any, next as any);
    return next;
};

describe("query sanitisation", () => {
    test("a sanitised query actually sticks", () => {
        const req = fakeReq({ query: { q: "<script>alert(1)</script>" } });

        run(req);

        expect(req.query.q).not.toContain("<script>");
    });

    test("the value survives a second read, not just the first", () => {
        const req = fakeReq({ query: { q: "<img src=x onerror=alert(1)>" } });

        run(req);
        const first = req.query.q;
        const second = req.query.q;

        expect(first).toBe(second);
        expect(second).not.toContain("onerror=alert");
    });

    test("every key is covered, not only the first", () => {
        const req = fakeReq({ query: { a: "<script>a</script>", b: "<script>b</script>" } });

        run(req);

        expect(req.query.a).not.toContain("<script>");
        expect(req.query.b).not.toContain("<script>");
    });

    test("a repeated parameter arriving as an array is covered", () => {
        const req = fakeReq({ query: { tag: ["<script>x</script>", "ok"] } });

        run(req);

        expect(req.query.tag[0]).not.toContain("<script>");
        expect(req.query.tag[1]).toBe("ok");
    });

    test("harmless values are left recognisable", () => {
        const req = fakeReq({ query: { page: "2", sort: "createdAt" } });

        run(req);

        expect(req.query.page).toBe("2");
        expect(req.query.sort).toBe("createdAt");
    });

    test("an absent query is not turned into something", () => {
        const req = fakeReq();

        expect(() => run(req)).not.toThrow();
    });

    test("calls next exactly once", () => {
        const next = run(fakeReq({ query: { q: "x" } }));

        expect(next.callCount).toBe(1);
    });
});

describe("body sanitisation", () => {
    test("strips a script tag from a top-level string", () => {
        const req = fakeReq({ body: { bio: "<script>alert(1)</script>" } });

        run(req);

        expect(req.body.bio).not.toContain("<script>");
    });

    test("walks nested objects and arrays", () => {
        const req = fakeReq({
            body: { profile: { tags: ["<script>x</script>", { deep: "<script>y</script>" }] } }
        });

        run(req);

        expect(req.body.profile.tags[0]).not.toContain("<script>");
        expect(req.body.profile.tags[1].deep).not.toContain("<script>");
    });

    test("leaves non-string values alone", () => {
        const req = fakeReq({ body: { age: 30, ok: true, missing: null } });

        run(req);

        expect(req.body.age).toBe(30);
        expect(req.body.ok).toBe(true);
        expect(req.body.missing).toBeNull();
    });

    test("an undefined body is left undefined rather than invented", () => {
        const req = fakeReq({ body: undefined });

        run(req);

        expect(req.body).toBeUndefined();
    });

    // JSON.parse creates "__proto__" as an OWN property, so assigning it onto a
    // normal object hits Object.prototype's setter: the key vanishes and the
    // object's prototype is reassigned instead.
    test("a __proto__ key does not reach Object.prototype", () => {
        const req = fakeReq({ body: JSON.parse('{"__proto__":{"polluted":true}}') });

        run(req);

        expect(({} as any).polluted).toBeUndefined();
    });

    test("a deeply nested payload is bounded rather than overflowing the stack", () => {
        let nested: any = "<script>x</script>";
        for (let i = 0; i < 5000; i++) nested = [nested];
        const req = fakeReq({ body: nested });

        expect(() => run(req)).not.toThrow();
    });
});
