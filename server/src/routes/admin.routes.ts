import { Router } from "express";
import { getReports } from "../controllers/admin.controller";

const router = Router();

// GET /api/admin/reports
router.get("/reports", getReports);

export default router;


