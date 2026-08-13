import React, { createContext, useContext, useEffect, useState } from "react";
import { initSession as requestSession, type Session } from "../services/session";

interface SessionContextType {
    session: Session | null;
    loading: boolean;
    refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    const initSession = async () => {
        try {
            setSession(await requestSession());
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

export type { Session };
