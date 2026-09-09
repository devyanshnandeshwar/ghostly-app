import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// happy-dom does not implement these, and components reach for them on mount:
// next-themes reads matchMedia, and the scroll area and framing hook use the
// observers. Stubbed here so a missing browser API never looks like a test
// failure in the code under test.
if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
    })) as unknown as typeof window.matchMedia;
}

class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
        return [];
    }
}

window.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
});
