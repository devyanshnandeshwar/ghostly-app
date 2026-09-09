import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown, formatRemaining } from "./useCountdown";

// The regression this guards: formatRemaining floored, while the initial value
// is seeded from the raw figure the server sent and the first interval tick
// lands a millisecond or so late. Seed floor(10000/1000) = 10; first tick sees
// 8999ms, floors to 8. Every mount and every re-prime visibly skipped a second:
// 10, 8, 7. Ceil makes a partial second still read as that second.

afterEach(() => vi.useRealTimers());

describe("formatRemaining", () => {
    test("renders hours, minutes and seconds zero-padded", () => {
        expect(formatRemaining(3_661_000)).toBe("01:01:01");
    });

    test("renders a full day", () => {
        expect(formatRemaining(86_400_000)).toBe("24:00:00");
    });

    test("renders nothing once the window has passed", () => {
        expect(formatRemaining(0)).toBe("");
        expect(formatRemaining(-1000)).toBe("");
    });

    // The bug, pinned directly: the value a countdown from 10s shows one tick in.
    test("a partial second rounds up rather than skipping one", () => {
        expect(formatRemaining(10_000)).toBe("00:00:10");
        expect(formatRemaining(8_999)).toBe("00:00:09");
    });

    test("never shows zero while time remains", () => {
        expect(formatRemaining(1)).toBe("00:00:01");
        expect(formatRemaining(999)).toBe("00:00:01");
    });

    test("counts down without repeating or skipping across a whole second", () => {
        expect(formatRemaining(3000)).toBe("00:00:03");
        expect(formatRemaining(2001)).toBe("00:00:03");
        expect(formatRemaining(2000)).toBe("00:00:02");
    });
});

describe("useCountdown", () => {
    test("shows a value immediately rather than blank for the first second", () => {
        const { result } = renderHook(() => useCountdown(10));

        expect(result.current).toBe("00:00:10");
    });

    test("returns nothing when the server reports no window", () => {
        expect(renderHook(() => useCountdown(undefined)).result.current).toBe("");
        expect(renderHook(() => useCountdown(0)).result.current).toBe("");
    });

    // The user-visible form of the bug.
    test("does not skip a second on the first tick", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useCountdown(10));

        act(() => {
            vi.advanceTimersByTime(1001);
        });

        expect(result.current).toBe("00:00:09");
    });

    test("counts down one second at a time", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useCountdown(10));

        act(() => vi.advanceTimersByTime(1000));
        expect(result.current).toBe("00:00:09");
        act(() => vi.advanceTimersByTime(1000));
        expect(result.current).toBe("00:00:08");
    });

    // Anchored to a deadline rather than decremented per tick, so a tab that
    // was backgrounded and missed intervals does not drift slow.
    test("a tab that missed ticks resumes at the right time, not behind", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useCountdown(60));

        act(() => vi.advanceTimersByTime(30_000));

        expect(result.current).toBe("00:00:30");
    });

    test("re-primes when the server reports a new window", () => {
        const { result, rerender } = renderHook(({ s }) => useCountdown(s), {
            initialProps: { s: 10 as number | undefined }
        });

        rerender({ s: 3600 });

        expect(result.current).toBe("01:00:00");
    });

    test("clears when the caller stops passing a window", () => {
        const { result, rerender } = renderHook(({ s }) => useCountdown(s), {
            initialProps: { s: 10 as number | undefined }
        });

        rerender({ s: undefined });

        expect(result.current).toBe("");
    });

    test("stops once the window elapses", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useCountdown(2));

        act(() => vi.advanceTimersByTime(5000));

        expect(result.current).toBe("");
    });

    test("clears its interval on unmount", () => {
        vi.useFakeTimers();
        const clear = vi.spyOn(globalThis, "clearInterval");
        const { unmount } = renderHook(() => useCountdown(10));

        unmount();

        expect(clear).toHaveBeenCalled();
    });
});
