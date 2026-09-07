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

// Exactly one proxy (Caddy) sits in front. Without this, req.ip is Caddy's
// container IP for EVERY request, so all unauthenticated callers shared a
// single rate-limit bucket -- 100 requests from anyone locked out every new
// visitor, because /api/session/init is the first call each one makes.
//
// Deliberately 1, not `true`: trusting every hop lets a client spoof
// X-Forwarded-For and evade the limiter entirely. With a hop count, Express
// takes the entry Caddy appended and ignores anything the client invented.
app.set("trust proxy", 1);

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

app.get("/health", (_, res) => {
    res.json({ status: "OK" });
});

app.use(errorHandler);

export default app;
