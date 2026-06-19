const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const approvalController = require("../controllers/approvalController");

const router = express.Router();

router.use(authenticate);

router.get("/pending", requireRole("admin", "superadmin", "hod", "manager"), companyIsolation, approvalController.getPendingApprovals);
router.patch("/:id/approve", requireRole("admin", "superadmin", "hod", "manager"), companyIsolation, approvalController.approveUser);
router.delete("/:id/reject", requireRole("admin", "superadmin", "hod", "manager"), companyIsolation, approvalController.rejectUser);

router.get("/self-registration",    requireRole("admin", "superadmin"), approvalController.getSelfRegistrationStatus);
router.patch("/self-registration",  requireRole("admin", "superadmin"), approvalController.toggleSelfRegistration);

module.exports = router;
