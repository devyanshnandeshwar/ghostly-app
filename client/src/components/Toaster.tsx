import { useCallback, useMemo, useState } from "react";
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

        setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, DISMISS_AFTER_MS);
    }, []);

    const api = useMemo(() => ({ notify }), [notify]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                // polite, not assertive: these are status messages, and an
                // assertive region interrupts whatever a screen reader is saying.
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role="status"
                        className="glass-panel pointer-events-auto flex max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300"
                    >
                        {toast.tone === "warning" ? (
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                        ) : (
                            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1">{toast.message}</span>
                        <button
                            type="button"
                            onClick={() =>
                                setToasts((current) => current.filter((t) => t.id !== toast.id))
                            }
                            aria-label="Dismiss"
                            className="mt-0.5 shrink-0 rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
