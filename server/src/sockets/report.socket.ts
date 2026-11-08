import { Server, Socket } from "socket.io";
import xss from "xss";
import { createReport } from "../services/report.service";
import { REPORT_REASONS, ReportReason } from "../models/Report";
import { logger } from "../utils/logger";
import { getActiveMatch, clearActiveMatch } from "../services/presence.service";
import type { SessionSocket } from "./socketManager";
import { safeHandler, isRecord } from "./safeHandler";
import type { ReportResult } from "../types/SocketEvents";

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
    socket.on("report-user", safeHandler("report-user", async (payload: unknown, acknowledge?: unknown) => {
        const reply = (result: ReportResult) => {
            if (typeof acknowledge === "function") acknowledge(result);
            else if (!result.ok) socket.emit("queue-error", result.error);
        };
        // Validate before destructuring -- see safeHandler.ts. A bare
        // `socket.emit("report-user")` used to be enough to end the process.
        if (!isRecord(payload)) {
            reply({ ok: false, error: "Choose a report reason and try again." });
            return;
        }
        const { reason, description } = payload;
        let roomId: string;
        try {
            const activeMatch = await getActiveMatch(socket.id);
            if (!activeMatch) {
                reply({ ok: false, error: "This conversation has ended. The report was not sent." });
                return;
            }
            roomId = activeMatch.roomId;
            const reporterId = socket.data.session._id.toString();
            await createReport(
                reporterId,
                activeMatch.partnerSessionId,
                cleanReason(reason),
                roomId,
                cleanDescription(description)
            );
            logger.info(`[Socket] Report submitted by ${reporterId}`);
        } catch (error) {
            logger.error(`Report error: ${error instanceof Error ? error.message : "unknown failure"}`);
            reply({ ok: false, error: "Could not submit that report. Please try again." });
            return;
        }

        reply({ ok: true });
        if (typeof acknowledge === "function") socket.emit("report-submitted");
        else socket.emit("queue-error", "Report submitted. Disconnecting...");

        // A teardown failure must not tell the user that a stored report failed.
        try {
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

        } catch (error) {
            logger.error(`Report teardown error: ${error instanceof Error ? error.message : "unknown failure"}`);
        }
    }));
};
