const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/register", authController.register);
router.post("/register-lecturer", authController.registerLecturer);
router.post("/register-student", authController.registerStudent);
router.post("/register-employee", authController.registerEmployee);
router.post("/login", authController.login);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.getMe);
router.post("/migrate-orphans", authenticate, requireRole("superadmin"), authController.migrateOrphanUsers);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
