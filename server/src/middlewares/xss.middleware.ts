import { Request, Response, NextFunction } from "express";
import xss from "xss";

/**
 * How deep a payload may nest before we stop walking it.
 *
 * The walk below is recursive and runs before globalLimiter, so a deeply nested
 * array was free CPU for an attacker and a stack overflow for us.
 */
const MAX_DEPTH = 20;

const sanitize = (obj: any, depth = 0): any => {
    if (depth > MAX_DEPTH) return undefined;

    if (typeof obj === "string") {
        return xss(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item, depth + 1));
    }

    if (typeof obj === "object" && obj !== null) {
        // Null-prototype: a payload carrying a literal "__proto__" key -- which
        // JSON.parse creates as an own property -- would otherwise hit
        // Object.prototype's setter and reassign this object's prototype
        // instead of becoming a field on it.
        const sanitizedObj: any = Object.create(null);
        for (const [key, value] of Object.entries(obj)) {
            sanitizedObj[key] = sanitize(value, depth + 1);
        }
        return sanitizedObj;
    }

    return obj;
};

export const xssMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body) req.body = sanitize(req.body);

    // req.query in Express 5 is a getter that re-parses the query string on
    // EVERY access and returns a fresh object each time -- there is no memo
    // (see express/lib/request.js, defineGetter with only a `get`).
    //
    // So the previous loop here:
    //
    //     for (const key in req.query) req.query[key] = sanitize(req.query[key]);
    //
    // read one throwaway object and wrote into a second. It did not throw; it
    // simply did nothing, and every later reader got raw input. Replacing the
    // getter with a value is the only way to make a sanitised query stick.
    const query = req.query;
    if (query && Object.keys(query).length > 0) {
        Object.defineProperty(req, "query", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: sanitize(query)
        });
    }

    // req.params is deliberately not touched. This middleware is mounted
    // app-level, before any router has matched, so req.params is always {} here
    // -- the loop that used to sit here could never iterate. Leaving it in
    // implied a protection that did not exist. Route params are validated at
    // the point of use instead.

    next();
};
