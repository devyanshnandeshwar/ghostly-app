import React, { createContext, useContext, useEffect, useState } from "react";
import { useSocket } from "./SocketContext";
import { useSession } from "./SessionContext";
import { useToast } from "@/lib/toast";

interface MatchResult {
    roomId: string;
    partnerNickname: string;
    partnerBio: string;
}

interface MatchContextType {
    status: "idle" | "waiting" | "matched";
    roomId: string | null;
    partner: { nickname: string; bio: string } | null;
    findMatch: () => void;
    resetMatch: () => void;
    leaveMatch: () => void;
    nextMatch: () => void;
    cancelMatch: () => void;
}

const MatchContext = createContext<MatchContextType | null>(null);

export const MatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { socket } = useSocket();
    const { notify } = useToast();
    const { refreshSession } = useSession();
    const [status, setStatus] = useState<"idle" | "waiting" | "matched">("idle");
    const [roomId, setRoomId] = useState<string | null>(null);
    const [partner, setPartner] = useState<{ nickname: string; bio: string } | null>(null);

    const findMatch = () => {
        if (!socket || !socket.connected) {
            // Previously a bare return: the button did nothing, with no spinner,
            // no message and no state change.
            notify("Not connected yet. Check your connection and try again.", "warning");
            return;
        }
        socket.emit("join-queue");
        setStatus("waiting");
        setPartner(null);
        setRoomId(null);
    };

    const resetMatch = () => {
        setStatus("idle");
        setRoomId(null);
        setPartner(null);
    };

    const leaveMatch = () => {
        if (!socket) return;
        socket.emit("leave-chat");
        resetMatch();
    };

    const nextMatch = () => {
        if (!socket) return;
        socket.emit("next-match");
        // We do NOT reset immediately, we wait for "queue-waiting" or "queue-cooldown"
        // But the UI needs to know we are "searching"
        setStatus("waiting");
        setRoomId(null);
        setPartner(null);
    };

    const cancelMatch = () => {
        if (!socket) return;
        if (status === "waiting") {
            socket.emit("leave-queue");
        } else if (status === "matched") {
            socket.emit("leave-chat");
        }
        resetMatch();
    };

    useEffect(() => {
        if (!socket) return;


        const onQueueWaiting = () => {
            console.log("[MatchContext] Queue Waiting...");
            setStatus("waiting");
        };

        const onMatched = ({ roomId, partnerNickname, partnerBio }: MatchResult) => {
            console.log("[MatchContext] Matched!", roomId);
            setRoomId(roomId);
            setPartner({ nickname: partnerNickname, bio: partnerBio });
            setStatus("matched");
            refreshSession();
        };
        

        const onQueueError = (error: string) => {
            notify(error, "warning");
            setStatus("idle");
        };

        const onQueueCooldown = ({ remaining }: { remaining: number }) => {
            setStatus("idle");
            notify(`Give it ${remaining}s before searching again.`);
        };

        const onPartnerLeft = () => {
            notify("Your partner left the chat.");
            resetMatch();
        };

        const onPartnerSkipped = () => {
             notify("Your partner moved on. Search again when you are ready.");
             resetMatch();
        };

        // Emitted when an event exceeds its per-socket budget.
        const onRateLimited = () => {
            notify("You are going a bit fast. Give it a moment.", "warning");
            setStatus("idle");
        };

        // socket.io stops retrying after reconnectionAttempts, and nothing used
        // to observe that -- a user on a network blocking the transport saw an
        // app that simply never did anything. Handled here as an event rather
        // than derived in an effect body, so the state update sits in a
        // callback where it belongs.
        const onReconnectFailed = () => {
            notify("Lost connection. Reload the page to reconnect.", "warning");
            setStatus("idle");
        };

        socket.on("queue-waiting", onQueueWaiting);
        socket.on("rate-limited", onRateLimited);
        socket.io.on("reconnect_failed", onReconnectFailed);
        socket.on("matched", onMatched);
        socket.on("queue-error", onQueueError);
        socket.on("queue-cooldown", onQueueCooldown);
        socket.on("partner-left", onPartnerLeft);
        socket.on("partner-skipped", onPartnerSkipped);

        return () => {
            socket.off("queue-waiting", onQueueWaiting);
            socket.off("rate-limited", onRateLimited);
            socket.io.off("reconnect_failed", onReconnectFailed);
            socket.off("matched", onMatched);
            socket.off("queue-error", onQueueError);
            socket.off("queue-cooldown", onQueueCooldown);
            socket.off("partner-left", onPartnerLeft);
            socket.off("partner-skipped", onPartnerSkipped);
        };
        // refreshSession is stable (useCallback in SessionContext), so listing it
        // does not re-register these listeners on every render.
    }, [socket, refreshSession, notify]);

    return (
        <MatchContext.Provider value={{ status, roomId, partner, findMatch, resetMatch, leaveMatch, nextMatch, cancelMatch }}>
            {children}
        </MatchContext.Provider>
    );
};

export const useMatch = () => {
    const context = useContext(MatchContext);
    if (!context) throw new Error("useMatch must be used within MatchProvider");
    return context;
};
