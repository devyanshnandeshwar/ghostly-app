import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

    // Stable identity: consumers put refreshSession in effect dependency arrays
    // (MatchContext does), and a new function every render would tear down and
    // re-register their socket listeners on every render.
    const initSession = useCallback(async () => {
        try {
            setSession(await requestSession());
        } catch (error) {
            console.error("Session init failed:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        initSession();
    }, [initSession]);

    // Memoised for the same reason: a fresh object every render re-renders every
    // consumer of this context, which is most of the app.
    const value = useMemo(
        () => ({ session, loading, refreshSession: initSession }),
        [session, loading, initSession]
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used within SessionProvider");
    return context;
};

export type { Session };
