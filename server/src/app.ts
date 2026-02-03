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

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
}));
app.use(express.json());
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
        deviceId: session.deviceId
    });
});

app.use(errorHandler);

export default app;
