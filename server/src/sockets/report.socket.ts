import { Server, Socket } from "socket.io";
import xss from "xss";
import { createReport } from "../services/report.service";
import { REPORT_REASONS, ReportReason } from "../models/Report";
import { logger } from "../utils/logger";
import { getActiveMatch, clearActiveMatch } from "../services/presence.service";
import type { SessionSocket } from "./socketManager";

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
    socket.on("report-user", async ({ reason, description }: { reason?: unknown, description?: unknown }) => {
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
                await clearActiveMatch(s.id);
            }

        } catch (error: any) {
            logger.error(`Report error: ${error.message}`);
            socket.emit("queue-error", error.message);
        }
    });
};
