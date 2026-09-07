import { Server, Socket } from "socket.io";
import { addToQueue, removeFromQueue, setCooldown, SKIP_COOLDOWN_SECONDS } from "../services/match.service";
import { setActiveMatch, getActiveMatch, clearActiveMatch } from "../services/presence.service";
import { getQueueSessionView, updateSession } from "../services/session.service";
import { hasFilterQuota, consumeFilter } from "../services/quota.service";
import { canEnterQueue } from "../services/moderation.policy";
import { rememberMatchUpdate } from "../services/matchHistory";
import { logger } from "../utils/logger";
import type { SessionSocket } from "./socketManager";

export const matchSocketHandler = (io: Server, socket: SessionSocket) => {
    socket.on("join-queue", async () => {
         try {
            const session = socket.data.session;
            // Redis-cached view: joining the queue no longer costs a Mongo read.
            const currentSession = await getQueueSessionView(session._id.toString());

            if (!currentSession) {
                socket.emit("queue-error", "Session not found");
                return;
            }

            if (!currentSession.ageConfirmed) {
                socket.emit("queue-error", "Please confirm your age before matching.");
                return;
            }

            if (!currentSession.isVerified || !currentSession.gender) {
                socket.emit("queue-error", "Verification required");
                return;
            }

            // Moderation actually bites here. Without this a reported or banned
            // account was matched with someone new by its very next join-queue.
            const admission = canEnterQueue(currentSession.status as any);
            if (!admission.allowed) {
                socket.emit("queue-error", admission.reason!);
                return;
            }

            // Freemium Limits Logic
            if (currentSession.preference !== "any") {
                const isAllowed = await hasFilterQuota(currentSession._id);
                if (!isAllowed) {
                     socket.emit("queue-error", "Daily limit reached for specific gender filters. Switch to 'Any' to continue.");
                     return;
                }
            }

            const result = addToQueue({
                socketId: socket.id,
                sessionId: currentSession._id,
                nickname: currentSession.nickname || "Anonymous",
                bio: currentSession.bio || "",
                gender: currentSession.gender as "male" | "female",
                preference: currentSession.preference as "male" | "female" | "any",
                pastMatches: currentSession.pastMatches || []
            });

            if (result && "error" in result) {
                socket.emit("queue-cooldown", { remaining: result.remaining });
                return;
            }

            const match = result;

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
        removeFromQueue(socket.id);
        if (await getActiveMatch(socket.id)) {
            await handleLeaveChat(io, socket, false);
        }
    });
};

async function handleLeaveChat(io: Server, socket: SessionSocket, isNext: boolean) {
    const activeMatch = await getActiveMatch(socket.id);

    // Clear Active Match Data immediately to prevent double processing
    await clearActiveMatch(socket.id);
    socket.data.publicKey = undefined;

    if (activeMatch) {
        const { roomId } = activeMatch;

        // Notify partner
        socket.to(roomId).emit(isNext ? "partner-skipped" : "partner-left");

        // Disconnect both from room. fetchSockets is adapter-aware, so a peer
        // on another instance is torn down too.
        const roomSockets = await io.in(roomId).fetchSockets();
        for (const s of roomSockets) {
            s.leave(roomId);
            s.data.publicKey = undefined;
            await clearActiveMatch(s.id);
        }
    }

    if (isNext) {
        const session = socket.data.session;
        if (session) {
            // _id, not sessionId: sessionId is a QueueUser field and is
            // undefined here, so this wrote ghosty:cooldown:undefined and the
            // skip cooldown never applied to anyone.
            await setCooldown(session._id.toString());

            // Report the cooldown we actually enforced. The client shows a
            // countdown from this, so a number that does not match the Redis
            // TTL is a countdown that expires into a refusal.
            socket.emit("queue-cooldown", { remaining: SKIP_COOLDOWN_SECONDS });
        }
    }
}

async function updateMatchHistory(id1: string, id2: string) {
    // updateSession invalidates the cached view, without which the next
    // join-queue inside the cache TTL reads a pastMatches list that does not
    // include this match yet -- and pairs the two of them straight back up.
    //
    // Bounded rather than $addToSet: the array was pruned by nothing and grew
    // for the life of the account. See matchHistory.ts for the trade.
    await updateSession(id1, rememberMatchUpdate(id2));
    await updateSession(id2, rememberMatchUpdate(id1));
}

async function updateUsage(user: any) {
     if (user.preference !== "any") {
        logger.info(`[Usage Limit] Incrementing usage for ${user.nickname} (${user.sessionId}) due to preference: ${user.preference}`);
        await consumeFilter(user.sessionId);

        // Lifetime counter, kept for analytics only. The enforced allowance is
        // the Redis window in quota.service -- these two must not be confused
        // again, which is why they no longer share a name.
        await updateSession(user.sessionId, {
            $inc: { dailyFilterUsage: 1 },
            lastFilterUsageDate: new Date()
        });
    } else {
        logger.info(`[Usage Limit] No increment for ${user.nickname} (${user.sessionId}) - preference is 'any'`);
    }
}
