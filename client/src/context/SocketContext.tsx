import React, { createContext, useContext, useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { useSession } from "./SessionContext";
import { socketService } from "../services/socketService";
import { getSessionToken } from "../utils/auth";

export type ConnectionState = "connecting" | "connected" | "failed";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    /**
     * "failed" means socket.io exhausted its retries and stopped. Nothing used
     * to observe that, so a user on a network that blocks the transport saw an
     * app that simply never did anything.
     */
    connectionState: ConnectionState;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session } = useSession();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

    useEffect(() => {
        const token = getSessionToken();
        if (session && token) {
            // In deployment we proxy Socket.IO through nginx, so same-origin works.
            const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
            const socketInstance = socketService.connect(socketUrl, token);
            // Creating an imperative resource and exposing it through state is
            // exactly the case this rule cannot distinguish from a derived-state
            // mistake. There is no render-time value to derive from: the socket
            // does not exist until the effect runs, and consumers must re-render
            // once it does.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSocket(socketInstance);

            const onConnect = () => {
                setIsConnected(true);
                setConnectionState("connected");
            };
            const onDisconnect = () => {
                setIsConnected(false);
                setConnectionState("connecting");
            };
            // socket.io stops retrying after reconnectionAttempts. This is the
            // only signal that it has given up for good.
            const onReconnectFailed = () => setConnectionState("failed");

            socketInstance.on("connect", onConnect);
            socketInstance.on("disconnect", onDisconnect);
            socketInstance.io.on("reconnect_failed", onReconnectFailed);

            return () => {
                socketInstance.off("connect", onConnect);
                socketInstance.off("disconnect", onDisconnect);
                socketInstance.io.off("reconnect_failed", onReconnectFailed);
            };
        }
    }, [session]);

    return (
        <SocketContext.Provider value={{ socket, isConnected, connectionState }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) throw new Error("useSocket must be used within SocketProvider");
    return context;
};
