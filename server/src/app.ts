import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import sessionRoutes from "./routes/session.routes";
import { verifySession } from "./middlewares/session.middleware";
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
app.use("/api/session", sessionRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);

app.get("/health", (_, res) => {
    res.json({ status: "OK" });
});

app.get("/api/protected", verifySession, (req, res) => {
    const session = (req as any).session;

    res.json({
        message: "Session verified",
        sessionId: session._id
    });
});

app.use(errorHandler);

export default app;
