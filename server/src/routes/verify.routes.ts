import { Router } from "express";
import multer from "multer";
import { verifySession } from "../middlewares/session.middleware";
import { verifyLimiter } from "../middlewares/rateLimit.middleware";
import { verifyIdentity } from "../controllers/verify.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
    "/gender",
    verifyLimiter,
    verifySession,
    upload.single("image"),
    verifyIdentity
);

export default router;
