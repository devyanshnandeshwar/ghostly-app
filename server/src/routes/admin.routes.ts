import { Router } from "express";
import {
    getReports,
    resolveReport,
    setSessionStatus,
    getAuditLog
} from "../controllers/admin.controller";
import { requireAdmin } from "../middlewares/admin.middleware";

const router = Router();

router.use(requireAdmin);

router.get("/reports", getReports);
router.post("/reports/:id/resolve", resolveReport);
router.post("/sessions/:id/status", setSessionStatus);
router.get("/audit", getAuditLog);

export default router;
