import mongoose from "mongoose";

const UserSessionSchema = new mongoose.Schema(
    {
        deviceId: {
            type: String,
            required: true,
            unique: true
        },

        isVerified: {
            type: Boolean,
            default: false
        },

        gender: {
            type: String,
            enum: ["male", "female"],
            default: null
        },

        preference: {
            type: String,
            enum: ["male", "female", "any"],
            default: "any"
        },

        pastMatches: {
            type: [String],
            default: []
        },

        dailyFilterUsage: {
            type: Number,
            default: 0
        },

        lastFilterUsageDate: {
            type: Date,
            default: Date.now
        },

        nickname: {
            type: String,
            default: null
        },

        bio: {
            type: String,
            default: null
        },

        userHash: {
            type: String,
            default: null
        },

        lastActive: {
            type: Date,
            default: Date.now
        },

        // Bumping this invalidates every outstanding token for THIS session
        // only. Without it the sole way to revoke anything was rotating
        // SESSION_SECRET, which logs out every user at once.
        tokenVersion: {
            type: Number,
            default: 0
        },

        // Set while a session is unverified, unset once it verifies. MongoDB's
        // TTL ignores documents where the field is absent, so a verified
        // session falls through to the 30-day lastActive rule below.
        expiresAt: {
            type: Date,
            default: null
        },

        // Enforced in the matchmaking gate. "limited" is applied automatically
        // when enough distinct people report an account; "banned" is only ever
        // set by a human.
        status: {
            type: String,
            enum: ["active", "limited", "banned"],
            default: "active"
        },

        totalReports: {
            type: Number,
            default: 0
        },

        reportsAgainst: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// TTL Index: Expire sessions after 30 days of inactivity
UserSessionSchema.index({ lastActive: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Short-lived expiry for sessions that never verified. Separate from the index
// above rather than replacing it: two indexes each doing one job avoids having
// to drop and rebuild a TTL index on a live collection.
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSession = mongoose.model(
    "UserSession",
    UserSessionSchema
);
