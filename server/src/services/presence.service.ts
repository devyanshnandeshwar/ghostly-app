import { redisClient } from "../config/redis";
import { logger } from "../utils/logger";

/**
 * Which match a socket is currently in.
 *
 * This lived in socket.data, which is per-process memory. With more than one
 * server instance the authorization guards in chat.socket would read undefined
 * for any socket matched on another replica and silently reject legitimate
 * traffic, so it lives in Redis where every instance can see it.
 */

const ACTIVE_MATCH_PREFIX = "ghosty:activematch";

// Long enough to outlive any real conversation, short enough that a crashed
// instance's entries do not linger forever.
const ACTIVE_MATCH_TTL_SECONDS = 60 * 60 * 4;

export interface ActiveMatch {
    partnerSessionId: string;
    roomId: string;
}

function getKey(socketId: string): string {
    return `${ACTIVE_MATCH_PREFIX}:${socketId}`;
}

export async function setActiveMatch(socketId: string, match: ActiveMatch) {
    try {
        await redisClient.setEx(
            getKey(socketId),
            ACTIVE_MATCH_TTL_SECONDS,
            JSON.stringify(match)
        );
    } catch (error: any) {
        logger.error(`Failed to record active match for ${socketId}: ${error.message}`);
    }
}

export async function getActiveMatch(socketId: string): Promise<ActiveMatch | null> {
    try {
        const raw = await redisClient.get(getKey(socketId));
        return raw ? JSON.parse(raw) : null;
    } catch (error: any) {
        logger.error(`Failed to read active match for ${socketId}: ${error.message}`);
        return null;
    }
}

export async function clearActiveMatch(socketId: string) {
    try {
        await redisClient.del(getKey(socketId));
    } catch (error: any) {
        logger.warn(`Failed to clear active match for ${socketId}: ${error.message}`);
    }
}
