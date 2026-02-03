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
