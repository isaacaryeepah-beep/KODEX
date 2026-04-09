const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const userController = require("../controllers/userController");
const router = express.Router();

router.use(authenticate);

router.get("/", requireRole("employee", "manager", "admin", "superadmin", "lecturer", "hod"), companyIsolation, userController.listUsers);
router.get("/stats", requireRole("admin", "superadmin", "manager", "hod"), companyIsolation, userController.getUserStats);
router.post("/", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.createUser);
router.post("/bulk", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.bulkAction);
router.post("/bulk-import", requireRole("admin", "superadmin"), companyIsolation, userController.bulkImportStudents);
router.patch("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.updateUser);
router.patch("/:id/activate", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.activateUser);
router.delete("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deactivateUser);
router.delete("/:id/permanent", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deleteUser);
router.get("/reset-logs/all", requireRole("admin", "superadmin"), companyIsolation, userController.getResetLogs);
router.post("/:id/admin-reset-password", requireRole("admin", "superadmin", "manager", "hod"), companyIsolation, userController.adminResetStudentPassword);
router.post("/change-password-after-reset", userController.changePasswordAfterReset);
router.post("/:id/clear-device-lock", requireRole("admin", "superadmin", "manager"), companyIsolation, userController.clearDeviceLock);


module.exports = router;
