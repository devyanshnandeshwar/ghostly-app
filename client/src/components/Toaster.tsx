import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

import { ToastContext, type ToastTone } from "@/lib/toast";

/**
 * Non-blocking notices.
 *
 * Replaces window.alert, which was the error system for queue failures,
 * cooldowns and a partner leaving. Those are routine events, not faults: an
 * alert made them feel like crashes, blocked the page until dismissed, and
 * stacked one per event when someone skipped quickly.
 */

interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
}

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const notify = useCallback((message: string, tone: ToastTone = "info") => {
        const id = Date.now() + Math.random();

        setToasts((current) => {
            // Bound the stack: skipping quickly produced a queue of alerts, and
            // a queue of toasts would only be a prettier version of that.
            const next = [...current, { id, message, tone }];
            return next.slice(-3);
        });

    }, []);

    const api = useMemo(() => ({ notify }), [notify]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                // polite, not assertive: these are status messages, and an
                // assertive region interrupts whatever a screen reader is saying.
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4"
            >
                {toasts.map((toast) => (
                    <ToastNotice
                        key={toast.id}
                        toast={toast}
                        onDismiss={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastNotice({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [paused, setPaused] = useState(false);
    useEffect(() => {
        if (toast.tone === "warning" || paused) return;
        const timer = setTimeout(onDismiss, DISMISS_AFTER_MS);
        return () => clearTimeout(timer);
    }, [toast.tone, paused, onDismiss]);

    return (
        <div
            role="status"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
            className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2.5 text-sm text-card-foreground animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
            {toast.tone === "warning" ? <AlertTriangle className="w-4 icon-lh text-destructive" /> : <Info className="w-4 icon-lh text-muted-foreground" />}
            <span className="min-w-0 flex-1 self-center wrap-break-word">{toast.message}</span>
            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring">
                <X className="size-4" />
            </button>
        </div>
    );
}
