import api from "./client";
import { getSessionToken, setSessionToken } from "../utils/auth";

export interface Session {
    _id: string;
    isVerified: boolean;
    nickname?: string;
    bio?: string;
    gender?: string;
    preference?: string;
    /** Lifetime filtered matches. Analytics only -- not the quota. */
    dailyFilterUsage?: number;
    lastFilterUsageDate?: string;
    /** Whether the self-declared age gate has been passed. Gates matchmaking. */
    ageConfirmed?: boolean;
    /** Filtered matches spent in the current rolling window. This is the quota. */
    filtersUsedToday?: number;
    /** Filtered matches still available. Sent by the server; never computed here. */
    filtersRemaining?: number;
    /** The allowance itself. Sent by the server so the client holds no copy. */
    filtersTotal?: number;
    /** Seconds until the allowance resets, 0 when no window is open. */
    filtersResetInSeconds?: number;
    reportsAgainst?: number;
    userHash?: string;
}

interface InitResponse extends Session {
    token: string;
}

/**
 * Resumes the stored session, or asks the server for a new one. The server
 * decides which: a token it did not sign is simply ignored.
 */
export async function initSession(): Promise<Session> {
    const token = getSessionToken();

    const res = await api.post<InitResponse>("/session/init", { token });

    const { token: issued, ...session } = res.data;

    if (issued) {
        setSessionToken(issued);
    }

    return session;
}
