import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
    {
        reporterId: {
            type: String,
            required: true
        },
        reportedId: {
            type: String,
            required: true
        },
        reason: {
            type: String,
            default: "Unspecified"
        },
        description: {
            type: String,
            required: false
        },
        roomId: {
            type: String,
            required: false // Optional context
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        resolved: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

export const Report = mongoose.model("Report", ReportSchema);
