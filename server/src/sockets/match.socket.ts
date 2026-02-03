import { Server, Socket } from "socket.io";
import { addToQueue, removeFromQueue, setCooldown } from "../services/match.service";
import { checkDailyLimit, incrementDailyUsage } from "../services/session.service";
import { UserSession } from "../models/UserSession";
import { logger } from "../utils/logger";

export const matchSocketHandler = (io: Server, socket: Socket) => {
    socket.on("join-queue", async () => {
         try {
            const session = socket.data.session;
            const currentSession = await UserSession.findById(session._id);
            
            if (!currentSession) {
                socket.emit("queue-error", "Session not found");
                return;
            }

            if (!currentSession.isVerified || !currentSession.gender) {
                socket.emit("queue-error", "Verification required");
                return;
            }

            // Freemium Limits Logic (Redis)
            if (currentSession.preference !== "any") {
                const isAllowed = await checkDailyLimit(currentSession._id.toString());
                if (!isAllowed) {
                     socket.emit("queue-error", "Daily limit reached for specific gender filters. Switch to 'Any' to continue.");
                     return;
                }
            }

            const result = await addToQueue({
                socketId: socket.id,
                sessionId: currentSession._id.toString(),
                nickname: currentSession.nickname || "Anonymous",
                bio: currentSession.bio || "",
                gender: currentSession.gender as "male" | "female",
                preference: currentSession.preference as "male" | "female" | "any",
                pastMatches: currentSession.pastMatches || []
            });

            if (result && "error" in result) {
                // @ts-ignore
                socket.emit("queue-cooldown", { remaining: result.remaining });
                return;
            }

            const match = result as { user1: any, user2: any } | null;

            if (match) {
                const roomId = `room-${match.user1.socketId}-${match.user2.socketId}`;
                
                const s1 = io.sockets.sockets.get(match.user1.socketId);
                const s2 = io.sockets.sockets.get(match.user2.socketId);

                if (s1) s1.join(roomId);
                if (s2) s2.join(roomId);

                io.to(match.user1.socketId).emit("matched", {
                    roomId,
                    partnerNickname: match.user2.nickname,
                    partnerBio: match.user2.bio
                });

                io.to(match.user2.socketId).emit("matched", {
                    roomId,
                    partnerNickname: match.user1.nickname,
                    partnerBio: match.user1.bio
                });

                if (s1) s1.data.activeMatch = { partnerSessionId: match.user2.sessionId, roomId };
                if (s2) s2.data.activeMatch = { partnerSessionId: match.user1.sessionId, roomId };

                // Update DB
                await updateMatchHistory(match.user1.sessionId, match.user2.sessionId);
                await updateUsage(match.user1);
                await updateUsage(match.user2);

                logger.info(`Match created: ${roomId}`);
            } else {
                socket.emit("queue-waiting");
            }

         } catch (err: any) {
             logger.error(`Queue error: ${err.message}`);
             socket.emit("queue-error", "Internal error");
         }
    });

    socket.on("leave-queue", () => {
        removeFromQueue(socket.id);
    });

    socket.on("leave-chat", () => {
        handleLeaveChat(io, socket, false);
    });

    socket.on("next-match", () => {
        handleLeaveChat(io, socket, true);
    });

    socket.on("disconnect", () => {
        removeFromQueue(socket.id);
        const activeMatch = socket.data.activeMatch;
        if (activeMatch) {
            handleLeaveChat(io, socket, false);
        }
    });
};

function handleLeaveChat(io: Server, socket: Socket, isNext: boolean) {
    const activeMatch = socket.data.activeMatch;
    
    // Clear Active Match Data immediately to prevent double processing
    socket.data.activeMatch = null;

    if (activeMatch) {
        const { roomId, partnerSessionId } = activeMatch;
        
        // Notify partner
        socket.to(roomId).emit(isNext ? "partner-skipped" : "partner-left");
        
        // Disconnect both from room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const s = io.sockets.sockets.get(socketId);
                if (s) {
                    s.leave(roomId);
                    s.data.activeMatch = null;
                }
            }
        }
    }

    if (isNext) {
        // Apply Cooldown to requester
        const session = socket.data.session;
        if (session) {
            // Apply 5 second cooldown for skipping
            // We use a custom cooldown mechanism or re-use addToQueue's check
            // For now, let's just re-join the queue, and addToQueue will handle basic cooldowns if we set them
            // But we want a SPECIFIC "skip cooldown" maybe?
            // The prompt says "Apply skip cooldown (example: 10s)"
            // let's manually set a cooldown in the service
            
            // Re-join queue automatically after a short delay on client side? 
            // OR server side? 
            // The prompt says "Automatically rejoin matchmaking queue after cooldown"
            // It is better to let the CLIENT emit "join-queue" again after showing a countdown.
            // But the backend requirements say "Add requester back to queue". 
            // If we add back immediately, they might match the same person or spam.
            
            // Implementation Choice: Emit "requeue-in" to client, let client wait and re-emit "join-queue".
            // This allows UI to show "Searching in 5..."
            socket.emit("queue-cooldown", { remaining: 5 }); 
            // Actually, let's set the cooldown in backend so if they force it, it fails.
            setCooldown(session.sessionId);
        }
    }
}

async function updateMatchHistory(id1: string, id2: string) {
    await UserSession.findByIdAndUpdate(id1, { $addToSet: { pastMatches: id2 } });
    await UserSession.findByIdAndUpdate(id2, { $addToSet: { pastMatches: id1 } });
}

async function updateUsage(user: any) {
     if (user.preference !== "any") {
        logger.info(`[Usage Limit] Incrementing usage for ${user.nickname} (${user.sessionId}) due to preference: ${user.preference}`);
        // Redis Increment
        await incrementDailyUsage(user.sessionId);
        
        // DB Persistence (for analytics)
        await UserSession.findByIdAndUpdate(user.sessionId, { 
            $inc: { dailyFilterUsage: 1 },
            lastFilterUsageDate: new Date()
        });
    } else {
        logger.info(`[Usage Limit] No increment for ${user.nickname} (${user.sessionId}) - preference is 'any'`);
    }
}
