import { Request, Response, NextFunction } from "express";
import xss from "xss";

const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
        return xss(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item));
    }
    
    if (typeof obj === "object" && obj !== null) {
        const sanitizedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitizedObj[key] = sanitize(value);
        }
        return sanitizedObj;
    }
    
    return obj;
};

export const xssMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body) req.body = sanitize(req.body);
    
    // req.query and req.params are getters in express 5+, we must mutate their keys or replace carefully if needed
    // However, since express parses them, mutating the object's keys is safer than assignment
    if (req.query) {
        for (const key in req.query) {
            req.query[key] = sanitize(req.query[key]) as any;
        }
    }
    if (req.params) {
        for (const key in req.params) {
            req.params[key] = sanitize(req.params[key]);
        }
    }
    
    next();
};
