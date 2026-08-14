import { Request, Response, NextFunction } from "express";

import { logger } from "../utils/logger";
import { config } from "../config/env";

export interface CustomError extends Error {
    statusCode?: number;
}

export const errorHandler = (
    err: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Multer rejects oversized uploads before any handler runs. That is a
    // client error, not a server fault, so don't log a stack for it.
    if ((err as any).code === "LIMIT_FILE_SIZE") {
        logger.info(`[Upload] Rejected oversized file on ${req.originalUrl}`);
        return res.status(413).json({
            success: false,
            error: "Image is too large. Please use a file under 5MB."
        });
    }

    logger.error(`[Error] ${err.message}`);
    if (config.NODE_ENV !== 'test') {
        logger.error(err.stack || "");
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({
        success: false,
        error: message,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
};
