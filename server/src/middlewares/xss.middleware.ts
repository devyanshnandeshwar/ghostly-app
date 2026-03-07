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
    if (req.query) req.query = sanitize(req.query);
    if (req.params) req.params = sanitize(req.params);
    
    next();
};
