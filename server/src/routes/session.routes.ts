import { Router } from "express";
import { sessionLimiter } from "../middlewares/rateLimit.middleware";
import { init } from "../controllers/session.controller";

const router = Router();

// Initialize or Fetch Session
router.post("/init", sessionLimiter, init);

export default router;
