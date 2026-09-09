import { describe, expect, test } from "vitest";
import { cameraErrorMessage } from "./cameraError";

// The regression this guards: the branching this replaces tested err.MESSAGE
// for "Permission", "NotFound" and "DeviceNotFound". err.message is human prose
// that varies by browser and locale -- Chrome's no-camera message is "Requested
// device not found" and Firefox's denial is "The request is not allowed by the
// user agent". Neither branch could fire on either browser, so both of the two
// cases actually worth explaining fell through to printing the raw platform
// sentence at the user.

describe("a blocked camera", () => {
    test.each([
        ["Chrome and Firefox", "NotAllowedError", "Permission denied"],
        ["Firefox's wording, which contains no 'Permission'", "NotAllowedError", "The request is not allowed by the user agent"],
        ["older WebKit", "PermissionDeniedError", "denied"],
        ["an insecure context", "SecurityError", "The operation is insecure."]
    ])("is explained for %s", (_label, name, message) => {
        expect(cameraErrorMessage(new DOMException(message, name))).toMatch(/address bar/);
    });
});

describe("no camera present", () => {
    // Chrome's actual message, which contains neither "NotFound" nor
    // "DeviceNotFound" -- the exact reason the old branch never fired.
    test("is explained for Chrome's wording", () => {
        expect(
            cameraErrorMessage(new DOMException("Requested device not found", "NotFoundError"))
        ).toBe("No camera was found on this device.");
    });

    test.each(["DevicesNotFoundError", "OverconstrainedError"])("is explained for %s", (name) => {
        expect(cameraErrorMessage(new DOMException("x", name))).toBe(
            "No camera was found on this device."
        );
    });
});

describe("a camera another app is holding", () => {
    test.each(["NotReadableError", "TrackStartError"])("is explained for %s", (name) => {
        expect(cameraErrorMessage(new DOMException("x", name))).toMatch(/already in use/);
    });
});

describe("anything else", () => {
    test("falls back to the platform's own text rather than inventing one", () => {
        expect(cameraErrorMessage(new DOMException("Something odd", "AbortError"))).toBe(
            "Something odd"
        );
    });

    test("handles a non-Error value without crashing", () => {
        expect(cameraErrorMessage(undefined)).toBe("The camera could not be started.");
        expect(cameraErrorMessage("nope")).toBe("nope");
    });

    test("never returns an empty string, which would render as no error at all", () => {
        for (const value of [undefined, null, "", {}, new DOMException("", "AbortError")]) {
            expect(cameraErrorMessage(value).length).toBeGreaterThan(0);
        }
    });
});
