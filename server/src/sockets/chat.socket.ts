import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";

export const chatSocketHandler = (io: Server, socket: Socket) => {
    // E2EE Key Exchange
    socket.on("exchange-key", ({ roomId, key }: { roomId: string, key: JsonWebKey }) => {
        socket.to(roomId).emit("exchange-key", key);
    });

    // Chat Handlers
    socket.on("join-room", (roomId: string) => {
        const activeMatch = socket.data.activeMatch;
        if (!activeMatch || activeMatch.roomId !== roomId) {
             logger.warn(`Unauthorized join attempt by ${socket.id} for room ${roomId}`);
             return;
        }

        socket.join(roomId);
        logger.debug(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("send-message", ({ roomId, message, iv }: { roomId: string, message: string, iv: string }) => {
        // Server ONLY relays ciphertext + IV. No decryption possible.
        socket.to(roomId).emit("receive-message", { message, iv });
    });

    socket.on("typing", ({ roomId, isTyping }: { roomId: string, isTyping: boolean }) => {
        socket.to(roomId).emit("partner-typing", isTyping);
    });
};
