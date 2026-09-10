import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { SessionProvider, useSession, COLD_START_NOTICE_MS } from "./SessionContext";

// Render's free tier spins down after 15 minutes idle and takes roughly a
// minute to wake. The first visitor after a nap therefore waits on session init
// with nothing on screen explaining why -- which, for a portfolio piece, is the
// likeliest reason someone decides the app is broken and closes the tab.

const requestSession = vi.hoisted(() => vi.fn());
vi.mock("../services/session", () => ({ initSession: requestSession }));

function Probe() {
    const { loading, isColdStart } = useSession();
    return <span data-testid="state">{`${loading}:${isColdStart}`}</span>;
}

const renderProbe = () =>
    render(
        <SessionProvider>
            <Probe />
        </SessionProvider>
    );

const state = () => screen.getByTestId("state").textContent;

beforeEach(() => {
    vi.useFakeTimers();
    requestSession.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("cold start", () => {
    test("does not cry wolf on a fast response", async () => {
        requestSession.mockResolvedValue({ _id: "s1", isVerified: false });

        renderProbe();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(50);
        });

        expect(state()).toBe("false:false");
    });

    test("stays quiet while the wait is still ordinary", async () => {
        requestSession.mockReturnValue(new Promise(() => {}));

        renderProbe();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(COLD_START_NOTICE_MS - 100);
        });

        expect(state()).toBe("true:false");
    });

    test("admits the server is waking once the wait is clearly not ordinary", async () => {
        requestSession.mockReturnValue(new Promise(() => {}));

        renderProbe();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(COLD_START_NOTICE_MS + 100);
        });

        expect(state()).toBe("true:true");
    });

    test("clears the notice once the session arrives", async () => {
        let settle: (value: unknown) => void = () => {};
        requestSession.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

        renderProbe();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(COLD_START_NOTICE_MS + 100);
        });
        expect(state()).toBe("true:true");

        await act(async () => {
            settle({ _id: "s1", isVerified: false });
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(state()).toBe("false:false");
    });

    test("clears the notice when the request fails, so the error screen is not masked", async () => {
        let fail: (reason: unknown) => void = () => {};
        requestSession.mockReturnValue(new Promise((_, reject) => { fail = reject; }));

        renderProbe();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(COLD_START_NOTICE_MS + 100);
        });

        await act(async () => {
            fail(new Error("network"));
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(state()).toBe("false:false");
    });

    test("waits long enough not to fire on an ordinary warm request", () => {
        // A warm Render response is well under a second; a cold one is ~50s.
        // The threshold has to sit clearly between the two.
        expect(COLD_START_NOTICE_MS).toBeGreaterThanOrEqual(2000);
        expect(COLD_START_NOTICE_MS).toBeLessThanOrEqual(10000);
    });
});
