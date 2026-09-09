import { errorName, errorText } from "./apiError";

/**
 * Turns a getUserMedia failure into advice the user can act on.
 *
 * Keyed on err.name, which is the stable identifier, never on err.message,
 * which is human prose that varies by browser and locale. The branching this
 * replaces tested err.message for the substrings "Permission", "NotFound" and
 * "DeviceNotFound" -- and Chrome's no-camera message is "Requested device not
 * found" while Firefox's denial is "The request is not allowed by the user
 * agent". Neither branch could fire on either browser, so both of the two cases
 * worth explaining fell through to printing the raw platform sentence.
 */
export function cameraErrorMessage(err: unknown): string {
    switch (errorName(err)) {
        case "NotAllowedError":
        case "PermissionDeniedError":
        case "SecurityError":
            return "Camera access was blocked. Allow it from the icon in your address bar, then try again.";

        case "NotFoundError":
        case "DevicesNotFoundError":
        case "OverconstrainedError":
            return "No camera was found on this device.";

        // Another application holds the device, which is common on desktop and
        // has a different fix from either of the above.
        case "NotReadableError":
        case "TrackStartError":
            return "Your camera is already in use by another app. Close it and try again.";

        default:
            return errorText(err, "The camera could not be started.");
    }
}
