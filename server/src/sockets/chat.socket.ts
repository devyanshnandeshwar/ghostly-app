import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { getActiveMatch } from "../services/presence.service";

export const chatSocketHandler = (io: Server, socket: Socket) => {
    // Every room-scoped event must prove the caller is actually in that match.
    // Room IDs are unguessable in practice, but that is obscurity, not authorization.
    // Read from Redis rather than socket.data so the check holds across instances.
    const isInRoom = async (roomId: string, event: string): Promise<boolean> => {
        const activeMatch = await getActiveMatch(socket.id);
        if (!activeMatch || activeMatch.roomId !== roomId) {
            logger.warn(`Unauthorized ${event} attempt by ${socket.id} for room ${roomId}`);
            return false;
        }
        return true;
    };

    // E2EE Key Exchange
    socket.on("exchange-key", async ({ roomId, key }: { roomId: string, key: JsonWebKey }) => {
        if (!await isInRoom(roomId, "exchange-key")) return;

        socket.data.publicKey = key;
        socket.to(roomId).emit("exchange-key", key);

        // Check if partner already uploaded their key earlier (fixes React mounting race condition!)
        // fetchSockets() is adapter-aware, so this also finds a partner on another instance.
        const roomSockets = await io.in(roomId).fetchSockets();
        for (const partnerSocket of roomSockets) {
            if (partnerSocket.id !== socket.id && partnerSocket.data.publicKey) {
                socket.emit("exchange-key", partnerSocket.data.publicKey);
            }
        }
    });

    // Chat Handlers
    socket.on("join-room", async (roomId: string) => {
        if (!await isInRoom(roomId, "join")) return;

        socket.join(roomId);
        logger.debug(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on("send-message", async ({ roomId, message, iv }: { roomId: string, message: string, iv: string }) => {
        if (!await isInRoom(roomId, "send-message")) return;

        // Server ONLY relays ciphertext + IV. No decryption possible.
        socket.to(roomId).emit("receive-message", { message, iv });
    });

    socket.on("typing", async ({ roomId, isTyping }: { roomId: string, isTyping: boolean }) => {
        if (!await isInRoom(roomId, "typing")) return;

        socket.to(roomId).emit("partner-typing", isTyping);
    });
};
