import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initSession as requestSession, type Session } from "../services/session";

/**
 * How long session init may take before we admit the server is asleep.
 *
 * The API runs on a free tier that spins down after 15 minutes idle and takes
 * roughly a minute to wake. A warm response is well under a second, so this sits
 * clearly between the two: long enough never to fire on an ordinary request,
 * short enough that nobody stares at an unexplained skeleton for a minute
 * deciding the app is broken.
 */
export const COLD_START_NOTICE_MS = 4000;

interface SessionContextType {
    session: Session | null;
    loading: boolean;
    /** True while a slow first request is still outstanding. */
    isColdStart: boolean;
    refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isColdStart, setIsColdStart] = useState(false);
    const coldStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Stable identity: consumers put refreshSession in effect dependency arrays
    // (MatchContext does), and a new function every render would tear down and
    // re-register their socket listeners on every render.
    const initSession = useCallback(async () => {
        if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
        coldStartTimer.current = setTimeout(
            () => setIsColdStart(true),
            COLD_START_NOTICE_MS
        );

        try {
            setSession(await requestSession());
        } catch (error) {
            console.error("Session init failed:", error);
        } finally {
            if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
            coldStartTimer.current = null;
            // Cleared on failure too: the error screen explains itself, and
            // leaving "still waking up" on top of it would contradict it.
            setIsColdStart(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        initSession();
        return () => {
            if (coldStartTimer.current) clearTimeout(coldStartTimer.current);
        };
    }, [initSession]);

    // Memoised for the same reason: a fresh object every render re-renders every
    // consumer of this context, which is most of the app.
    const value = useMemo(
        () => ({ session, loading, isColdStart, refreshSession: initSession }),
        [session, loading, isColdStart, initSession]
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used within SessionProvider");
    return context;
};

export type { Session };
