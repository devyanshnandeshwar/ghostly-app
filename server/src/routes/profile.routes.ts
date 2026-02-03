import { Router } from "express";
import { verifySession } from "../middlewares/session.middleware";
import { update } from "../controllers/profile.controller";

const router = Router();

router.post("/update", verifySession, update);

export default router;
