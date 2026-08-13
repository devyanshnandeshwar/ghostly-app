import mongoose from "mongoose";
import { config } from "../config/env";

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

// Without this the collection grows without bound: UserSession has a TTL index
// but Report had none, so reports outlived the accounts they refer to forever.
// Opt out with REPORT_RETENTION_DAYS=0 if reports must be kept indefinitely.
if (config.REPORT_RETENTION_DAYS > 0) {
    ReportSchema.index(
        { timestamp: 1 },
        { expireAfterSeconds: config.REPORT_RETENTION_DAYS * 24 * 60 * 60 }
    );
}

// Unresolved reports are read newest-first on every admin page load.
ReportSchema.index({ resolved: 1, timestamp: -1 });

export const Report = mongoose.model("Report", ReportSchema);
