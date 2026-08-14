import { Router } from "express";
import { getReports } from "../controllers/admin.controller";
import { requireAdmin } from "../middlewares/admin.middleware";

const router = Router();

router.use(requireAdmin);

// GET /api/admin/reports
router.get("/reports", getReports);

export default router;


