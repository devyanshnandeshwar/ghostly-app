import { Server, Socket } from "socket.io";
import xss from "xss";
import { createReport } from "../services/report.service";
import { REPORT_REASONS, ReportReason } from "../models/Report";
import { logger } from "../utils/logger";
import { getActiveMatch, clearActiveMatch } from "../services/presence.service";
import type { SessionSocket } from "./socketManager";
import { safeHandler, isRecord } from "./safeHandler";

// xssMiddleware only covers Express. Socket payloads never passed through it,
// so report text reached Mongo raw and unbounded -- and /api/admin/reports
// hands it straight back to whatever renders the moderation queue.
const DESCRIPTION_LIMIT = 500;

function cleanReason(reason: unknown): ReportReason {
    return REPORT_REASONS.includes(reason as ReportReason) ? (reason as ReportReason) : "Other";
}

function cleanDescription(description: unknown): string | undefined {
    if (typeof description !== "string") return undefined;

    const trimmed = description.trim().slice(0, DESCRIPTION_LIMIT);
    if (!trimmed) return undefined;

    return xss(trimmed);
}

export const reportSocketHandler = (io: Server, socket: SessionSocket) => {
    socket.on("report-user", safeHandler("report-user", async (payload: unknown) => {
        // Validate before destructuring -- see safeHandler.ts. A bare
        // `socket.emit("report-user")` used to be enough to end the process.
        if (!isRecord(payload)) return;
        const { reason, description } = payload as { reason?: unknown; description?: unknown };

        const activeMatch = await getActiveMatch(socket.id);
        if (!activeMatch) return;

        const { partnerSessionId, roomId } = activeMatch;
        const reporterId = socket.data.session._id.toString();

        try {
            await createReport(
                reporterId,
                partnerSessionId,
                cleanReason(reason),
                roomId,
                cleanDescription(description)
            );
            logger.info(`[Socket] Report submitted by ${reporterId}`);

            // Notify Reporter (using custom event or reuse queue-error)
            socket.emit("queue-error", "Report submitted. Disconnecting...");

            // Disconnect both users from the room
            const roomSockets = await io.in(roomId).fetchSockets();

            for (const s of roomSockets) {
                s.emit("partner-disconnected");
                s.leave(roomId);
                // The E2EE public key is per conversation. handleLeaveChat
                // clears it on every teardown path and this one did not, so a
                // key survived onto the next match: the reconciliation loop in
                // chat.socket then served a partner the key from the previous
                // conversation, which the other side had already rotated away
                // from. Nothing they sent could be decrypted.
                s.data.publicKey = undefined;
                await clearActiveMatch(s.id);
            }

        } catch (error: any) {
            logger.error(`Report error: ${error.message}`);
            // createReport throws both intentional user-facing strings and
            // whatever the Mongo driver raises. Relaying error.message sent the
            // latter -- index names, validation internals -- straight to the
            // browser.
            socket.emit("queue-error", "Could not submit that report. Please try again.");
        }
    }));
};
