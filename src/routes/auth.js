const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const authController = require("../controllers/authController");
const { loginLimiter, registerLimiter, passwordResetLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// ── Auth routes with rate limiting ───────────────────────────────────────────
router.post("/register",               registerLimiter,       authController.register);
router.post("/register-lecturer",      registerLimiter,       authController.registerLecturer);
router.post("/register-student",       registerLimiter,       authController.registerStudent);
router.post("/register-employee",      registerLimiter,       authController.registerEmployee);
router.post("/login",                  loginLimiter,          authController.login);
router.post("/logout",                 authenticate,          authController.logout);
router.get("/me",                      authenticate,          authController.getMe);
router.post("/migrate-orphans",        authenticate, requireRole("superadmin"), authController.migrateOrphanUsers);
router.post("/forgot-password",        passwordResetLimiter,  authController.forgotPassword);
router.post("/reset-password",         passwordResetLimiter,  authController.resetPassword);
router.post("/forgot-password-email",  passwordResetLimiter,  authController.forgotPasswordEmail);
router.post("/reset-password-email",   passwordResetLimiter,  authController.resetPasswordEmail);
router.post("/forgot-password-admin",  passwordResetLimiter,  authController.forgotPasswordAdmin);  // ← ADDED
router.put("/profile",                 authenticate,          authController.updateProfile);
router.post("/2fa/toggle",             authenticate,          authController.toggle2FA);
router.post("/2fa/send",               authenticate,          authController.send2FACode);
router.post("/2fa/verify",             authenticate,          authController.verify2FACode);

router.post("/test-email",              authController.testEmail);

module.exports = router;
