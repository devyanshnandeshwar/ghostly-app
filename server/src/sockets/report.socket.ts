import { Server, Socket } from "socket.io";
import { createReport } from "../services/report.service";
import { logger } from "../utils/logger";

export const reportSocketHandler = (io: Server, socket: Socket) => {
    socket.on("report-user", async ({ reason, description }: { reason: string, description?: string }) => {
        if (!socket.data.activeMatch) return;
        
        const { partnerSessionId, roomId } = socket.data.activeMatch;
        const reporterId = socket.data.session._id.toString();

        try {
            await createReport(reporterId, partnerSessionId, reason, roomId, description);
            logger.info(`[Socket] Report submitted by ${reporterId}`);
            
            // Notify Reporter (using custom event or reuse queue-error)
            socket.emit("queue-error", "Report submitted. Disconnecting..."); 

            // Disconnect both users from the room
            const roomSockets = await io.in(roomId).fetchSockets();
            
            roomSockets.forEach((s) => {
                    s.emit("partner-disconnected");
                    s.leave(roomId);
                    s.data.activeMatch = undefined;
            });
            
        } catch (error: any) {
            logger.error(`Report error: ${error.message}`);
            socket.emit("queue-error", error.message);
        }
    });
};
