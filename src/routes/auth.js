// ──────────────────────────────────────────────────────────────────────────────
//  KODEX Auth Routes
//  Mounted at /api/auth in server.js. The authenticate middleware lives in
//  src/middleware/auth.js — this file used to be a corrupted duplicate of it
//  which broke every login. Do not export the middleware from here.
// ──────────────────────────────────────────────────────────────────────────────
const express = require("express");
const authenticate = require("../middleware/auth");
const ctrl = require("../controllers/authController");

const router = express.Router();

// ── Public endpoints ─────────────────────────────────────────────────────────
router.post("/login", ctrl.login);

router.post("/register",          ctrl.register);
router.post("/register-lecturer", ctrl.registerLecturer);
router.post("/register-student",  ctrl.registerStudent);
router.post("/register-employee", ctrl.registerEmployee);

router.post("/forgot-password",       ctrl.forgotPassword);
router.post("/forgot-password-email", ctrl.forgotPasswordEmail);
router.post("/forgot-password-admin", ctrl.forgotPasswordAdmin);
router.post("/reset-password",        ctrl.resetPassword);
router.post("/reset-password-email",  ctrl.resetPasswordEmail);

// ── Authenticated endpoints ──────────────────────────────────────────────────
router.post("/logout", authenticate, ctrl.logout);
router.get("/me",      authenticate, ctrl.getMe);
router.put("/profile", authenticate, ctrl.updateProfile);

router.post("/2fa/toggle", authenticate, ctrl.toggle2FA);
router.post("/2fa/send",   authenticate, ctrl.send2FACode);
router.post("/2fa/verify", authenticate, ctrl.verify2FACode);

module.exports = router;
