import { Socket } from "socket.io";
import { UserSession } from "../models/UserSession";
import { IUserSession } from "@shared/types/User";



export async function socketAuth(
    socket: Socket,
    next: (err?: Error) => void
) {
    try {
        const deviceId = socket.handshake.auth?.deviceId;

        if (!deviceId) {
            return next(new Error("Device ID missing"));
        }

        // We use lean() to get a plain JS object which matches IUserSession interface better than a Mongoose document
        // Casting as unknown as IUserSession safely
        const session = await UserSession.findOne({ deviceId }).lean();

        if (!session) {
            return next(new Error("Invalid session"));
        }

        // Attach session to socket
        socket.data.session = session as unknown as IUserSession;

        next();

    } catch (error) {
        next(new Error("Socket authentication failed"));
    }
}
