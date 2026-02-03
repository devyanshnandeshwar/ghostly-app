import { UserSession } from "../models/UserSession";

interface ProfileData {
    nickname: string;
    bio?: string;
    preference?: string;
}

export const updateProfile = async (sessionId: string, data: ProfileData) => {
    const { nickname, bio, preference } = data;

    // Validation
    if (!nickname || typeof nickname !== "string" || nickname.length < 3 || nickname.length > 20) {
        const err: any = new Error("Nickname must be 3-20 characters");
        err.statusCode = 400;
        throw err;
    }

    if (bio && (typeof bio !== "string" || bio.length > 120)) {
        const err: any = new Error("Bio too long (max 120 chars)");
        err.statusCode = 400;
        throw err;
    }

    if (preference && !["male", "female", "any"].includes(preference)) {
        const err: any = new Error("Invalid preference");
        err.statusCode = 400;
        throw err;
    }

    // Regex checks
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(nickname) || (bio && urlRegex.test(bio))) {
        const err: any = new Error("No URLs allowed");
        err.statusCode = 400;
        throw err;
    }

    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
    if (emailRegex.test(nickname) || (bio && emailRegex.test(bio))) {
        const err: any = new Error("No emails allowed");
        err.statusCode = 400;
        throw err;
    }

    const phoneRegex = /(\+\d{1,3}[- ]?)?\d{10}/g;
    if (phoneRegex.test(nickname) || (bio && phoneRegex.test(bio))) {
        const err: any = new Error("No phone numbers allowed");
        err.statusCode = 400;
        throw err;
    }

    const alphaRegex = /[a-zA-Z0-9]/;
    if (!alphaRegex.test(nickname)) {
        const err: any = new Error("Nickname must contain alphanumeric characters");
        err.statusCode = 400;
        throw err;
    }

    await UserSession.findByIdAndUpdate(sessionId, {
        nickname,
        bio: bio || "",
        preference: preference || "any"
    });

    return { nickname, bio };
};
