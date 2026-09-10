import mongoose from "mongoose";

/**
 * An append-only record of every moderator action.
 *
 * There was previously no record at all: admin reads were not logged, actions
 * did not exist, and a single shared bearer token meant nothing was
 * attributable to a person even in principle. Abuse reports contain user-written
 * text about other users, so who touched them needs to be answerable -- both
 * internally and to anyone asking on a regulator's behalf.
 */
const AuditLogSchema = new mongoose.Schema(
    {
        /** Which credential acted. A shared token gives one value for everyone;
         *  that is a known limitation, recorded so it is visible rather than
         *  implied. */
        actor: { type: String, required: true },
        action: {
            type: String,
            required: true,
            enum: ["report.resolve", "session.limit", "session.ban", "session.reinstate"]
        },
        /** The session or report acted upon. */
        target: { type: String, required: true },
        note: { type: String, maxlength: 500 },
        timestamp: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ target: 1, timestamp: -1 });

// Deliberately the one collection with NO TTL, unlike UserSession and Report.
//
// These are moderation decisions -- who banned whom, and why. They are the
// record you need precisely when a decision is disputed, which is usually long
// after it was made, and they are written only when a moderator acts, so the
// volume is a rounding error against Atlas M0's 512MB.
//
// Expiring them would trade real accountability for storage nobody is short of.
// If that ever changes, archive out rather than adding expireAfterSeconds here:
// autoIndex is on, so a TTL added to this file starts deleting on the next boot,
// with no migration step to review first.

export const AuditLog = mongoose.model("AuditLog", AuditLogSchema);
