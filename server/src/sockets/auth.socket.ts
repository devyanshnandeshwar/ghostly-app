import { Socket } from "socket.io";
import { UserSession } from "../models/UserSession";
import { IUserSession } from "@shared/types/User";
import { verifySessionToken } from "../utils/token";
import { touchLastActive } from "../services/session.service";



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

        // We use lean() to get a plain JS object which matches IUserSession interface better than a Mongoose document
        // Casting as unknown as IUserSession safely
        const session = await UserSession.findOne({ deviceId: payload.deviceId }).lean();

        if (!session) {
            return next(new Error("Invalid session"));
        }

        // Attach session to socket
        socket.data.session = session as unknown as IUserSession;

        // Connecting counts as activity. Throttled internally, so this is not
        // a write on every connection.
        touchLastActive(String((session as any)._id)).catch(() => {});

        next();

    } catch (error) {
        next(new Error("Socket authentication failed"));
    }
}
