import React, { createContext, useContext, useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { useSession } from "./SessionContext";
import { socketService } from "../services/socketService";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { session } = useSession();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (session?.deviceId) {
            const socketInstance = socketService.connect("http://localhost:5000", session.deviceId);
            setSocket(socketInstance);

            const onConnect = () => setIsConnected(true);
            const onDisconnect = () => setIsConnected(false);

            socketInstance.on("connect", onConnect);
            socketInstance.on("disconnect", onDisconnect);

            return () => {
                socketInstance.off("connect", onConnect);
                socketInstance.off("disconnect", onDisconnect);
            };
        }
    }, [session]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) throw new Error("useSocket must be used within SocketProvider");
    return context;
};
