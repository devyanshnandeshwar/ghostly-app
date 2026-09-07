import { Router } from "express";
import { sessionLimiter } from "../middlewares/rateLimit.middleware";
import { init, logout } from "../controllers/session.controller";
import { verifySession } from "../middlewares/session.middleware";

const router = Router();

// Initialize or Fetch Session
router.post("/init", sessionLimiter, init);

// Revokes every outstanding token for the calling session.
router.post("/logout", verifySession, logout);

export default router;
