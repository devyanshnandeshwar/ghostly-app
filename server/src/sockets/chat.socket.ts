import { Server, Socket } from "socket.io";
import { logger } from "../utils/logger";
import { getActiveMatch } from "../services/presence.service";
import { safeHandler, isRecord } from "./safeHandler";

/**
 * Ciphertext for a chat message. Generous next to any real message, small
 * enough that relaying one is cheap; Socket.IO would otherwise accept up to its
 * 1MB default and fan it out untouched.
 */
const MAX_CIPHERTEXT_CHARS = 8 * 1024;
const MAX_IV_CHARS = 64;

function isRoomId(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export const chatSocketHandler = (io: Server, socket: Socket) => {
    // Every room-scoped event must prove the caller is actually in that match.
    // Room IDs are unguessable in practice, but that is obscurity, not authorization.
    // Read from the match store rather than socket.data, so a stale or forged
    // socket.data cannot vouch for itself. That store is in-process today, so
    // this does NOT hold across instances -- see socketManager.ts.
    const isInRoom = async (roomId: string, event: string): Promise<boolean> => {
        const activeMatch = await getActiveMatch(socket.id);
        if (!activeMatch || activeMatch.roomId !== roomId) {
            logger.warn(`Unauthorized ${event} attempt by ${socket.id} for room ${roomId}`);
            return false;
        }
        return true;
    };

    // E2EE Key Exchange
    socket.on("exchange-key", safeHandler("exchange-key", async (payload: unknown) => {
        // Validate before destructuring: `{ roomId } = undefined` throws inside
        // an async handler, which Socket.IO leaves unhandled and the runtime
        // turns into process exit. See safeHandler.ts.
        if (!isRecord(payload)) return;
        const { roomId, key } = payload as { roomId?: unknown; key?: unknown };

        if (!isRoomId(roomId) || !key || typeof key !== "object") return;
        if (!await isInRoom(roomId, "exchange-key")) return;

        socket.data.publicKey = key;
        socket.to(roomId).emit("exchange-key", key);

        // Check if partner already uploaded their key earlier (fixes React mounting race condition!)
        // fetchSockets() is adapter-aware, but the adapter is in-memory now, so
        // this finds only a partner owned by this process. Fine on one instance.
        const roomSockets = await io.in(roomId).fetchSockets();
        for (const partnerSocket of roomSockets) {
            if (partnerSocket.id !== socket.id && partnerSocket.data.publicKey) {
                socket.emit("exchange-key", partnerSocket.data.publicKey);
            }
        }
    }));

    // Chat Handlers
    socket.on("join-room", safeHandler("join-room", async (roomId: unknown) => {
        if (!isRoomId(roomId)) return;
        if (!await isInRoom(roomId, "join")) return;

        socket.join(roomId);
        logger.debug(`User ${socket.id} joined room ${roomId}`);
    }));

    socket.on("send-message", safeHandler("send-message", async (payload: unknown) => {
        if (!isRecord(payload)) return;
        const { roomId, message, iv } = payload as {
            roomId?: unknown;
            message?: unknown;
            iv?: unknown;
        };

        // Shape before authorisation: an oversized or malformed payload is not
        // worth a room lookup, and relaying one unchecked fans it out to the
        // partner at whatever size the sender chose.
        if (!isRoomId(roomId)) return;
        if (typeof message !== "string" || message.length > MAX_CIPHERTEXT_CHARS) {
            logger.warn(`Rejected oversized message from ${socket.id}`);
            return;
        }
        if (typeof iv !== "string" || iv.length > MAX_IV_CHARS) return;

        if (!await isInRoom(roomId, "send-message")) return;

        // Server ONLY relays ciphertext + IV. No decryption possible.
        socket.to(roomId).emit("receive-message", { message, iv });
    }));

    socket.on("typing", safeHandler("typing", async (payload: unknown) => {
        if (!isRecord(payload)) return;
        const { roomId, isTyping } = payload as { roomId?: unknown; isTyping?: unknown };

        if (!isRoomId(roomId) || typeof isTyping !== "boolean") return;
        if (!await isInRoom(roomId, "typing")) return;

        socket.to(roomId).emit("partner-typing", isTyping);
    }));
};
