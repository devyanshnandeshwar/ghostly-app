import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import sessionRoutes from "./routes/session.routes";
import verifyRoutes from "./routes/verify.routes";
import profileRoutes from "./routes/profile.routes";
import adminRoutes from "./routes/admin.routes";
import reportRoutes from "./routes/reports.routes";
import { errorHandler } from "./middlewares/error.middleware";
import { globalLimiter } from "./middlewares/rateLimit.middleware";
import { config } from "./config/env";
import { xssMiddleware } from "./middlewares/xss.middleware";

const app = express();

// Render fronts this service with Cloudflare and its own load balancer, so the
// forwarded chain is `client, cloudflare-edge, 10.x-render-lb`. `trust proxy` is
// a hop COUNT, and any count wrong for the platform silently resolves req.ip to
// an internal address -- one value for every visitor.
//
// Nothing security-relevant depends on it any more: both the rate limiter and
// the admin audit log resolve the caller through config/clientIp.ts, which
// prefers CF-Connecting-IP -- a header Cloudflare overwrites and a caller
// cannot forge. This stays so req.protocol and req.secure reflect the original
// scheme, and stays a NUMBER because express-rate-limit raises
// ERR_ERL_PERMISSIVE_TRUST_PROXY on every request when it is `true`.
app.set("trust proxy", 1);

// Before every middleware, deliberately. Behind globalLimiter a platform probe
// at 5s intervals is 180 requests per 15-minute window from one key, so the
// health check earned itself a 429 and the container was cycled for being
// unhealthy while serving fine. It also must not depend on the rate limiter's
// Redis store being reachable to answer at all.
app.get("/health", (_, res) => {
    res.json({ status: "OK" });
});

app.use(helmet());
app.use(compression());
app.use(cors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());
app.use(xssMiddleware);
app.use(globalLimiter);
// Versioned, because the client is a cached SPA that can lag a deploy by an
// arbitrary amount. Without a version segment there is no way to run an old and
// a new payload shape side by side during a rollout -- a breaking change simply
// breaks every stale tab.
//
// The unversioned prefix stays mounted as an alias so already-cached clients
// keep working. It is the compatibility surface, not the contract: new work
// targets /api/v1.
const routes = [
    ["/session", sessionRoutes],
    ["/verify", verifyRoutes],
    ["/profile", profileRoutes],
    ["/admin", adminRoutes],
    ["/reports", reportRoutes]
] as const;

for (const [path, router] of routes) {
    app.use(`/api/v1${path}`, router);
    app.use(`/api${path}`, router);
}

app.use(errorHandler);

export default app;
