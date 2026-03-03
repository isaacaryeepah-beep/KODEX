const express = require("express");
const mongoose = require("mongoose");
const QrToken = require("../models/QrToken");
const AttendanceSession = require("../models/AttendanceSession");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { validateDevice, enforceLogoutRestriction } = require("../middleware/deviceValidation");
const { requireActiveSubscription } = require("../middleware/subscription");

const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

const DEFAULT_EXPIRY_MINUTES = 5;

router.post(
  "/generate",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  companyIsolation,
  async (req, res) => {
    try {
      const { sessionId, expiryMinutes } = req.body;

      if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ error: "Valid session ID is required" });
      }

      const sessionFilter = { _id: sessionId, ...req.companyFilter };
      if (req.user.role === "lecturer") {
        sessionFilter.createdBy = req.user._id;
      }

      const session = await AttendanceSession.findOne(sessionFilter);

      if (!session) {
        return res.status(404).json({ error: "Attendance session not found or access denied" });
      }

      if (session.status !== "active") {
        return res.status(400).json({ error: "Attendance session is not active" });
      }

      const expiry = parseInt(expiryMinutes) || DEFAULT_EXPIRY_MINUTES;
      const expiresAt = new Date(Date.now() + expiry * 60 * 1000);

      let qrToken;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const code = await QrToken.generateUniqueCode(sessionId);
          const token = QrToken.generateToken();
          qrToken = await QrToken.create({
            session: sessionId,
            company: session.company,
            code,
            token,
            expiresAt,
            createdBy: req.user._id,
          });
          break;
        } catch (dupError) {
          if (dupError.code === 11000 && attempt < maxRetries - 1) continue;
          throw dupError;
        }
      }

      const populated = await qrToken.populate([
        { path: "session", select: "title status startedAt" },
        { path: "company", select: "name" },
        { path: "createdBy", select: "name email" },
      ]);

      res.status(201).json({
        qrToken: {
          id: populated._id,
          code: populated.code,
          token: populated.token,
          expiresAt: populated.expiresAt,
          session: populated.session,
          company: populated.company,
          createdBy: populated.createdBy,
        },
      });
    } catch (error) {
      console.error("Generate QR token error:", error);
      if (error.message.includes("Unable to generate unique code")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to generate QR token" });
    }
  }
);

router.post("/validate", validateDevice, enforceLogoutRestriction, async (req, res) => {
  try {
    const { token, code, sessionId } = req.body;

    if (!token && !code) {
      return res.status(400).json({ error: "Token or code is required" });
    }

    const query = {};
    if (token) {
      query.token = token;
    } else {
      if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ error: "Session ID is required when validating by code" });
      }
      query.code = code;
      query.session = sessionId;
    }

    const qrToken = await QrToken.findOne(query).populate([
      { path: "session", select: "title status startedAt" },
      { path: "company", select: "name" },
    ]);

    if (!qrToken) {
      return res.status(404).json({ valid: false, error: "Token not found" });
    }

    if (qrToken.isExpired()) {
      return res.status(410).json({ valid: false, error: "Token has expired" });
    }

    if (qrToken.isUsed) {
      return res.status(410).json({ valid: false, error: "Token has already been used" });
    }

    res.json({
      valid: true,
      qrToken: {
        id: qrToken._id,
        code: qrToken.code,
        expiresAt: qrToken.expiresAt,
        session: qrToken.session,
        company: qrToken.company,
      },
    });
  } catch (error) {
    console.error("Validate QR token error:", error);
    res.status(500).json({ error: "Failed to validate token" });
  }
});

router.get(
  "/session/:sessionId",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  companyIsolation,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({ error: "Invalid session ID" });
      }

      const sessionFilter = { _id: sessionId, ...req.companyFilter };
      if (req.user.role === "lecturer") {
        sessionFilter.createdBy = req.user._id;
      }

      const session = await AttendanceSession.findOne(sessionFilter);

      if (!session) {
        return res.status(404).json({ error: "Attendance session not found or access denied" });
      }

      const tokens = await QrToken.find({ session: sessionId })
        .sort({ createdAt: -1 })
        .populate("createdBy", "name email");

      res.json({ tokens });
    } catch (error) {
      console.error("List session tokens error:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  }
);

module.exports = router;
