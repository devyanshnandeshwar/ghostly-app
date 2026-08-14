import { Server, Socket } from "socket.io";
import { addToQueue, removeFromQueue, setCooldown } from "../services/match.service";
import { setActiveMatch, getActiveMatch, clearActiveMatch } from "../services/presence.service";
import { checkDailyLimit, incrementDailyUsage, getQueueSessionView, updateSession } from "../services/session.service";
import { logger } from "../utils/logger";

export const matchSocketHandler = (io: Server, socket: Socket) => {
    socket.on("join-queue", async () => {
         try {
            const session = socket.data.session;
            // Redis-cached view: joining the queue no longer costs a Mongo read.
            const currentSession = await getQueueSessionView(session._id.toString());

            if (!currentSession) {
                socket.emit("queue-error", "Session not found");
                return;
            }

            if (!currentSession.isVerified || !currentSession.gender) {
                socket.emit("queue-error", "Verification required");
                return;
            }

            // Freemium Limits Logic
            if (currentSession.preference !== "any") {
                const isAllowed = await checkDailyLimit(currentSession._id);
                if (!isAllowed) {
                     socket.emit("queue-error", "Daily limit reached for specific gender filters. Switch to 'Any' to continue.");
                     return;
                }
            }

            const result = await addToQueue({
                socketId: socket.id,
                sessionId: currentSession._id,
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
                
                // socketsJoin goes through the adapter, so it also works when
                // the peer is connected to a different instance. Looking the
                // socket up locally would silently skip a remote one.
                await io.in(match.user1.socketId).socketsJoin(roomId);
                await io.in(match.user2.socketId).socketsJoin(roomId);

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

                await setActiveMatch(match.user1.socketId, {
                    partnerSessionId: match.user2.sessionId,
                    roomId
                });
                await setActiveMatch(match.user2.socketId, {
                    partnerSessionId: match.user1.sessionId,
                    roomId
                });

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

    socket.on("disconnect", async () => {
        await removeFromQueue(socket.id);
        if (await getActiveMatch(socket.id)) {
            await handleLeaveChat(io, socket, false);
        }
    });
};

async function handleLeaveChat(io: Server, socket: Socket, isNext: boolean) {
    const activeMatch = await getActiveMatch(socket.id);

    // Clear Active Match Data immediately to prevent double processing
    await clearActiveMatch(socket.id);
    socket.data.publicKey = null;

    if (activeMatch) {
        const { roomId } = activeMatch;

        // Notify partner
        socket.to(roomId).emit(isNext ? "partner-skipped" : "partner-left");

        // Disconnect both from room. fetchSockets is adapter-aware, so a peer
        // on another instance is torn down too.
        const roomSockets = await io.in(roomId).fetchSockets();
        for (const s of roomSockets) {
            s.leave(roomId);
            s.data.publicKey = null;
            await clearActiveMatch(s.id);
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
    // updateSession invalidates the cached view, without which the next
    // join-queue inside the cache TTL reads a pastMatches list that does not
    // include this match yet -- and pairs the two of them straight back up.
    await updateSession(id1, { $addToSet: { pastMatches: id2 } });
    await updateSession(id2, { $addToSet: { pastMatches: id1 } });
}

async function updateUsage(user: any) {
     if (user.preference !== "any") {
        logger.info(`[Usage Limit] Incrementing usage for ${user.nickname} (${user.sessionId}) due to preference: ${user.preference}`);
        await incrementDailyUsage(user.sessionId);
        
        // DB Persistence (for analytics)
        await updateSession(user.sessionId, {
            $inc: { dailyFilterUsage: 1 },
            lastFilterUsageDate: new Date()
        });
    } else {
        logger.info(`[Usage Limit] No increment for ${user.nickname} (${user.sessionId}) - preference is 'any'`);
    }
}
