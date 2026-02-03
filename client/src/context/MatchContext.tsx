import React, { createContext, useContext, useEffect, useState } from "react";
import { useSocket } from "./SocketContext";
import { useSession } from "./SessionContext";

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
    const { refreshSession } = useSession();
    const [status, setStatus] = useState<"idle" | "waiting" | "matched">("idle");
    const [roomId, setRoomId] = useState<string | null>(null);
    const [partner, setPartner] = useState<{ nickname: string; bio: string } | null>(null);

    const findMatch = () => {
        if (!socket || !socket.connected) {
            console.error("[MatchContext] Socket not ready");
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
            console.error("[MatchContext] Queue Error:", error);
            alert(`Matchmaking Error: ${error}`);
            setStatus("idle");
        };

        const onQueueCooldown = ({ remaining }: { remaining: number }) => {
            console.warn("[MatchContext] Cooldown:", remaining);
            // alert(`Please wait ${remaining} seconds before searching again.`);
            // Instead of alert, maybe just log or toast? For now alert is fine as per Plan? 
            // Actually let's just use status idle so user sees the home screen again?
            // Or better: Re-emit join-queue after delay? 
            // For now, let's keep it simple: Go back to idle and user clicks again
            setStatus("idle");
            alert(`Cooldown: Please wait ${remaining}s.`);
        };

        const onPartnerLeft = () => {
            alert("Partner left the chat.");
            resetMatch();
        };

        const onPartnerSkipped = () => {
             alert("Partner skipped you.");
             resetMatch();
        };

        socket.on("queue-waiting", onQueueWaiting);
        socket.on("matched", onMatched);
        socket.on("queue-error", onQueueError);
        socket.on("queue-cooldown", onQueueCooldown);
        socket.on("partner-left", onPartnerLeft);
        socket.on("partner-skipped", onPartnerSkipped);

        return () => {
            socket.off("queue-waiting", onQueueWaiting);
            socket.off("matched", onMatched);
            socket.off("queue-error", onQueueError);
            socket.off("queue-cooldown", onQueueCooldown);
            socket.off("partner-left", onPartnerLeft);
            socket.off("partner-skipped", onPartnerSkipped);
        };
    }, [socket]);

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
