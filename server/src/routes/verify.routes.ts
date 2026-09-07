import { Router } from "express";
import { verifySession } from "../middlewares/session.middleware";
import { verifyLimiter } from "../middlewares/rateLimit.middleware";
import { verifyIdentity } from "../controllers/verify.controller";

const router = Router();

// JSON body, not an upload: the frame is classified on the device and only the
// result is sent. express.json() is mounted globally in app.ts.
// verifyLimiter still matters -- this endpoint writes session state on demand.
router.post("/gender", verifyLimiter, verifySession, verifyIdentity);

export default router;
