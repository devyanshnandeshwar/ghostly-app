import { createContext, useContext } from "react";

/**
 * Toast context and hook, separate from the provider component so the module
 * exports only non-components -- a file mixing both breaks React Fast Refresh.
 */

export type ToastTone = "info" | "warning";

export interface ToastApi {
    notify: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
    const context = useContext(ToastContext);
    // Deliberately not a throw. A missing provider must not take down a chat
    // because a status message had nowhere to go.
    return context ?? { notify: () => {} };
}
