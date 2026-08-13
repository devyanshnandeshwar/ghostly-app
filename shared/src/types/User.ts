export interface IUserSession {
    _id: string;
    deviceId: string;
    isVerified: boolean;
    gender: "male" | "female" | null;
    preference: "male" | "female" | "any";
    pastMatches: string[];
    nickname: string | null;
    bio: string | null;
    dailyFilterUsage: number;
    lastFilterUsageDate: Date;
    userHash: string | null;
    lastActive: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export type Gender = "male" | "female";

export interface QueueUser {
    socketId: string;
    sessionId: string;
    gender: Gender;
    preference: "male" | "female" | "any";
    pastMatches: string[];
    nickname: string;
    bio: string;
    // When this entry was enqueued. Used by the reconciler to avoid evicting a
    // socket that simply has not propagated across the cluster yet. Optional so
    // entries written before this field existed still parse.
    queuedAt?: number;
}

export interface MatchResult {
    roomId: string;
    partnerNickname: string;
    partnerBio: string;
}
