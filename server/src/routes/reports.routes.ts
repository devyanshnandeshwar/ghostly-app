import express from "express";
import { getReportStats } from "../controllers/reports.controller";

const router = express.Router();

router.get("/count", getReportStats);

export default router;
