import api from "./client";
import { getSessionToken, setSessionToken } from "../utils/auth";

export interface Session {
    _id: string;
    isVerified: boolean;
    nickname?: string;
    bio?: string;
    gender?: string;
    preference?: string;
    dailyFilterUsage?: number;
    lastFilterUsageDate?: string;
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
