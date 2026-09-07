import { Router } from "express";
import { sessionLimiter } from "../middlewares/rateLimit.middleware";
import { init, logout, confirmAge } from "../controllers/session.controller";
import { verifySession } from "../middlewares/session.middleware";

const router = Router();

// Initialize or Fetch Session
router.post("/init", sessionLimiter, init);

// Revokes every outstanding token for the calling session.
router.post("/logout", verifySession, logout);

// Records the self-declared age. Required before matchmaking.
router.post("/age", verifySession, confirmAge);

export default router;
