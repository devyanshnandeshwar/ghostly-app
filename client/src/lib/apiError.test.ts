import { describe, expect, test } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { apiErrorMessage, errorText } from "./apiError";

// apiErrorMessage exists so call sites stop reaching through `catch (err: any)`
// to err.response.data.error, which compiles against anything and yields
// undefined the moment the shape changes. These pin the shapes it must survive.

const requestConfig = () =>
    ({ headers: new AxiosHeaders() }) as InternalAxiosRequestConfig;

const axiosErrorWith = (data: unknown) =>
    new AxiosError("Request failed", "ERR_BAD_REQUEST", requestConfig(), null, {
        data,
        status: 400,
        statusText: "Bad Request",
        headers: new AxiosHeaders(),
        config: requestConfig()
    });

describe("apiErrorMessage", () => {
    test("prefers the server's own message", () => {
        expect(apiErrorMessage(axiosErrorWith({ error: "Nickname is taken" }), "fallback")).toBe(
            "Nickname is taken"
        );
    });

    test("falls back when the body carries no error field", () => {
        expect(apiErrorMessage(axiosErrorWith({ message: "nope" }), "fallback")).toBe("fallback");
    });

    test("falls back when error is present but empty", () => {
        expect(apiErrorMessage(axiosErrorWith({ error: "" }), "fallback")).toBe("fallback");
    });

    test("falls back when error is not a string", () => {
        expect(apiErrorMessage(axiosErrorWith({ error: { code: 7 } }), "fallback")).toBe("fallback");
        expect(apiErrorMessage(axiosErrorWith({ error: null }), "fallback")).toBe("fallback");
    });

    // A network failure has no response at all, which is the case the old
    // err.response.data.error reach-through crashed on.
    test("falls back for a network error with no response", () => {
        const err = new AxiosError("Network Error", "ERR_NETWORK");

        expect(apiErrorMessage(err, "Could not reach the server")).toBe(
            "Could not reach the server"
        );
    });

    test("falls back for a plain Error", () => {
        expect(apiErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
    });

    test.each([undefined, null, "a string", 42])("falls back for %p", (value) => {
        expect(apiErrorMessage(value, "fallback")).toBe("fallback");
    });

    test("does not treat an HTML error page as a message", () => {
        expect(apiErrorMessage(axiosErrorWith("<html>502 Bad Gateway</html>"), "fallback")).toBe(
            "fallback"
        );
    });
});

describe("errorText", () => {
    test("uses an Error's message", () => {
        expect(errorText(new Error("boom"), "fallback")).toBe("boom");
    });

    test("falls back to the name when there is no message", () => {
        expect(errorText(new Error(""), "fallback")).toBe("Error");
    });

    test("passes a raw string through", () => {
        expect(errorText("something went wrong", "fallback")).toBe("something went wrong");
    });

    test.each([undefined, null, {}, 42])("falls back for %p", (value) => {
        expect(errorText(value, "fallback")).toBe("fallback");
    });
});
