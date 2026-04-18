"use strict";

/**
 * hod.js — HOD-specific management endpoints
 * Mounted at: /api/hod
 *
 * GET  /locked-students        — list locked student accounts in HOD's scope
 * PATCH /unlock/:userId        — unlock a student account (with audit log)
 * GET  /pending-courses        — list lecturer-created courses awaiting HOD sign-off
 * PATCH /courses/:id/approve   — approve a pending course
 * PATCH /courses/:id/reject    — reject a pending course
 */

const express    = require("express");
const router     = express.Router();
const authenticate           = require("../middleware/auth");
const { requireRole }        = require("../middleware/role");
const { companyIsolation }   = require("../middleware/companyIsolation");
const hodCtrl                = require("../controllers/hodController");

router.use(authenticate);
// Admin and superadmin can also access these endpoints for management
router.use(requireRole("hod", "admin", "superadmin"));
router.use(companyIsolation);

// Student account locking
router.get("/locked-students",    hodCtrl.listLockedStudents);
router.patch("/unlock/:userId",   hodCtrl.unlockStudent);
router.post("/bulk-unlock",       hodCtrl.bulkUnlockStudents);

// Course approvals
router.get("/pending-courses",             hodCtrl.listPendingCourses);
router.patch("/courses/:id/approve",       hodCtrl.approveCourse);
router.patch("/courses/:id/reject",        hodCtrl.rejectCourse);

// Performance & analytics
router.get("/dashboard-stats",   hodCtrl.getDashboardStats);
router.get("/alerts",            hodCtrl.getAlerts);
router.get("/course-overview",   hodCtrl.getCourseOverview);

// Messaging
router.post("/send-group-message", hodCtrl.sendGroupMessage);

module.exports = router;
