import { Socket } from "socket.io";
import { verifySessionToken } from "../utils/token";
import { touchLastActive, getAuthSession } from "../services/session.service";

/**
 * Authenticates a socket handshake.
 *
 * Same short-lived cache as the HTTP path, for the same reason: this ran a
 * Mongo findOne on every connection, and a free-tier instance waking from
 * spin-down takes every reconnect at once.
 */
export async function socketAuth(
    socket: Socket,
    next: (err?: Error) => void
) {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Session token missing"));
        }

        const payload = verifySessionToken(token);

        if (!payload) {
            return next(new Error("Invalid session"));
        }

        const session = await getAuthSession(payload.deviceId);

        if (!session) {
            return next(new Error("Invalid session"));
        }

        // Same revocation check as the HTTP path: a bumped tokenVersion must
        // close the socket door too, or revocation only half works.
        if (session.tokenVersion !== payload.version) {
            return next(new Error("Session expired"));
        }

        socket.data.session = session as any;

        // Connecting counts as activity. Throttled internally, so this is not
        // a write on every connection.
        touchLastActive(session._id).catch(() => {});

        next();

    } catch (error) {
        next(new Error("Socket authentication failed"));
    }
}
