import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

interface Session {
    _id: string;
    deviceId: string;
    isVerified: boolean;
    nickname?: string;
    bio?: string;
    gender?: string;
    preference?: string;
    dailyFilterUsage?: number;
    lastFilterUsageDate?: string;
    reportsAgainst?: number;
    userHash?: string;
}

interface SessionContextType {
    session: Session | null;
    loading: boolean;
    refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const initSession = async () => {
        try {
            let deviceId = localStorage.getItem("deviceId");
            if (!deviceId) {
                deviceId = generateUUID();
                localStorage.setItem("deviceId", deviceId);
            }

            const response = await axios.post("http://localhost:5000/api/session/init", { deviceId });
            setSession(response.data);
        } catch (error) {
            console.error("Session init failed:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        initSession();
    }, []);

    return (
        <SessionContext.Provider value={{ session, loading, refreshSession: initSession }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used within SessionProvider");
    return context;
};
