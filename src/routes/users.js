const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const userController = require("../controllers/userController");
const router = express.Router();

router.use(authenticate);

router.get("/", requireRole("employee", "manager", "admin", "superadmin", "lecturer"), companyIsolation, userController.listUsers);
router.post("/", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.createUser);
router.post("/bulk", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.bulkAction);
router.patch("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.updateUser);
router.patch("/:id/activate", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.activateUser);
router.delete("/:id", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deactivateUser);
router.delete("/:id/permanent", requireRole("manager", "admin", "superadmin"), companyIsolation, userController.deleteUser);

module.exports = router;
