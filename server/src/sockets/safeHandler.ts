import { logger } from "../utils/logger";

/**
 * Wraps a socket event handler so a bad payload cannot take the process down.
 *
 * Socket.IO does not guard listener invocation: dispatch() calls the listener
 * inside a process.nextTick with no try/catch (socket.js, `emitUntyped.apply`).
 * A synchronous throw is therefore an uncaught exception, and an async handler
 * that rejects is an unhandled rejection -- and Node and Bun both exit non-zero
 * on those by default.
 *
 * That turned every handler which destructured its payload in the parameter
 * list into a remote kill switch:
 *
 *     socket.on("send-message", async ({ roomId, message, iv }) => {
 *
 * `socket.emit("send-message")` with no argument makes that destructure throw
 * inside an async function, and the process dies -- dropping every other
 * connected user with it. Sessions are free to mint via /session/init, so the
 * cost to an attacker was one line.
 *
 * Handlers now take `unknown` and validate with isRecord before destructuring;
 * this wrapper is the backstop that makes a missed guard a logged no-op rather
 * than an outage.
 */
export function safeHandler<T extends unknown[]>(
    event: string,
    handler: (...args: T) => unknown
): (...args: T) => void {
    return (...args: T) => {
        try {
            const result = handler(...args);

            if (result instanceof Promise) {
                result.catch((error: any) => {
                    logger.error(`[socket:${event}] ${error?.message ?? error}`);
                });
            }
        } catch (error: any) {
            logger.error(`[socket:${event}] ${error?.message ?? error}`);
        }
    };
}

/**
 * True for a payload that can be destructured.
 *
 * Arrays are excluded deliberately: `{ roomId } = []` yields undefined rather
 * than throwing, so an array payload would slip past a plain typeof check and
 * fail later, further from the cause.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
