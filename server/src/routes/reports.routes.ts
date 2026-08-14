import express from "express";
import { getReportStats } from "../controllers/reports.controller";
import { verifySession } from "../middlewares/session.middleware";

const router = express.Router();

router.get("/count", verifySession, getReportStats);

export default router;
