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

export const UserSession = mongoose.model(
    "UserSession",
    UserSessionSchema
);
