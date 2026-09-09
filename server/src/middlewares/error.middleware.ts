import { Request, Response, NextFunction } from "express";

import { logger } from "../utils/logger";
import { config } from "../config/env";

export interface CustomError extends Error {
    statusCode?: number;
}

/**
 * Generic text for anything we did not deliberately raise.
 *
 * err.message used to be returned unconditionally, including for 500s, so a
 * mongoose CastError, a Mongo topology error naming the connection host, or a
 * driver error carrying a connection string went to the client verbatim. An
 * error a handler chose to raise with a 4xx status is a message for the user; a
 * 500 is a message for the logs.
 */
const GENERIC_MESSAGE = "Internal Server Error";

export const errorHandler = (
    err: CustomError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Multer rejects oversized uploads before any handler runs. That is a
    // client error, not a server fault, so don't log a stack for it.
    // Express does not guarantee an Error here: next("something") and a thrown
    // string both arrive as-is, and reading .code off them threw.
    if (err && (err as any).code === "LIMIT_FILE_SIZE") {
        logger.info(`[Upload] Rejected oversized file on ${req.originalUrl}`);
        return res.status(413).json({
            success: false,
            error: "Image is too large. Please use a file under 5MB."
        });
    }

    logger.error(`[Error] ${err?.message}`);
    if (config.NODE_ENV !== "test") {
        logger.error(err?.stack || "");
    }

    // Nothing can be sent once the response has started. Writing anyway throws
    // ERR_HTTP_HEADERS_SENT from inside the error handler itself, at which
    // point Express falls back to its default handler and destroys the socket.
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err?.statusCode || 500;

    // Only echo a message the application chose to raise. Below 500 the status
    // was set deliberately by a handler and the text is meant for the caller.
    const message = statusCode < 500 ? err?.message || GENERIC_MESSAGE : GENERIC_MESSAGE;

    res.status(statusCode).json({
        success: false,
        error: message,
        // Opt in, not opt out. The old test was "not production", read off the
        // raw variable, while the line above used config.NODE_ENV -- which
        // falls back to "development". A deploy that left NODE_ENV unset, which
        // is routine on a PaaS, therefore shipped full stack traces with
        // absolute file paths to every client. EXPOSE_ERROR_DETAILS is true
        // only when someone explicitly asked for development or test.
        stack: config.EXPOSE_ERROR_DETAILS ? err?.stack : undefined
    });
};
