import axios from "axios";

/**
 * Pulls the server's own `{ error }` message out of a failed request.
 *
 * Exists so call sites stop reaching through `catch (err: any)` to
 * `err.response.data.error` -- which compiles against anything and silently
 * yields undefined the moment the shape changes, or the rejection is a
 * TypeError rather than an HTTP response.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
    if (axios.isAxiosError(err)) {
        const serverError = (err.response?.data as { error?: unknown } | undefined)?.error;
        if (typeof serverError === "string" && serverError) return serverError;
    }

    return fallback;
}

/** Best-effort human-readable text for a non-HTTP failure (DOMException, Error). */
export function errorText(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message || err.name || fallback;
    if (typeof err === "string" && err) return err;
    return fallback;
}

/**
 * The stable identifier for a thrown browser error.
 *
 * DOMException carries both a `name` ("NotAllowedError") and a `message`, and
 * only the name is stable: the message is human prose that varies by browser
 * and locale. Branching on the message meant branching on marketing copy --
 * Chrome says "Requested device not found", which contains neither "NotFound"
 * nor "DeviceNotFound", and Firefox's denial says "The request is not allowed
 * by the user agent", which does not contain "Permission". Both branches were
 * unreachable on both browsers.
 */
export function errorName(err: unknown): string {
    return err instanceof Error ? err.name : "";
}
