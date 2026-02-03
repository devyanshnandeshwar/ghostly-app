import { config } from "../config/env";

const isDev = config.NODE_ENV === "development";

export const logger = {
    info: (message: string, ...args: any[]) => {
        console.log(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
        console.warn(`[WARN] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`[ERROR] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
        if (isDev) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }
};
