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

const QR_EXPIRY_SECONDS   = 60;   // QR rotates every 60s - time-gated, multi-use
const VERBAL_EXPIRY_MINUTES = 5;  // Verbal code valid for 5 minutes - multi-use

// - Generate a token (QR or verbal) ---------------------------
router.post(
"/generate",
requireRole("admin", "manager", "lecturer", "superadmin"),
companyIsolation,
async (req, res) => {
try {
const { sessionId, expiryMinutes, expirySeconds, codeType = "qr" } = req.body;


  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: "Valid session ID is required" });
  }

  const sessionFilter = { _id: sessionId, ...req.companyFilter };
  if (req.user.role === "lecturer") sessionFilter.createdBy = req.user._id;

  const session = await AttendanceSession.findOne(sessionFilter);
  if (!session) return res.status(404).json({ error: "Attendance session not found or access denied" });
  if (session.status !== "active") return res.status(400).json({ error: "Attendance session is not active" });

  // For verbal codes: if one already exists and is still valid, return it (don't keep generating new ones)
  if (codeType === "verbal") {
    const existing = await QrToken.findOne({
      session: sessionId,
      codeType: "verbal",
      expiresAt: { $gt: new Date() },
    });
    if (existing) {
      return res.status(200).json({
        qrToken: {
          id: existing._id,
          code: existing.code,
          token: existing.token,
          expiresAt: existing.expiresAt,
          codeType: existing.codeType,
        },
      });
    }
  }

  // Calculate expiry
  let expiresAt;
  if (codeType === "verbal") {
    // Hard-coded to exactly 5 minutes - not overridable by caller
    expiresAt = new Date(Date.now() + VERBAL_EXPIRY_MINUTES * 60 * 1000);
  } else {
    const secs = parseInt(expirySeconds) || QR_EXPIRY_SECONDS;
    expiresAt = new Date(Date.now() + secs * 1000);
  }

  // Clean up expired tokens for this session to avoid unique index conflicts
  await QrToken.deleteMany({ session: sessionId, expiresAt: { $lt: new Date() } });

  let qrToken;
  const maxRetries = 5;
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
        codeType,
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
      codeType: populated.codeType,
      session: populated.session,
      company: populated.company,
      createdBy: populated.createdBy,
    },
  });
} catch (error) {
  console.error("Generate QR token error:", error);
  if (error.message.includes("Unable to generate unique code")) {
    return res.status(409).json({ error: "Could not generate a unique code. Please try again." });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: "A code conflict occurred. Please try again." });
  }
  res.status(500).json({ error: error.message || "Failed to generate token" });
}

}
);

// - Validate a token (used by student app before marking) ----------
router.post("/validate", validateDevice, enforceLogoutRestriction, async (req, res) => {
try {
const { token, code, sessionId } = req.body;
if (!token && !code) return res.status(400).json({ error: "Token or code is required" });


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

if (!qrToken) return res.status(404).json({ valid: false, error: "Token not found" });
if (qrToken.isExpired()) return res.status(410).json({ valid: false, error: "Token has expired" });

// QR is time-gated - not single-use
res.json({
  valid: true,
  qrToken: {
    id: qrToken._id,
    code: qrToken.code,
    expiresAt: qrToken.expiresAt,
    codeType: qrToken.codeType,
    session: qrToken.session,
    company: qrToken.company,
  },
});

} catch (error) {
console.error("Validate QR token error:", error);
res.status(500).json({ error: "Failed to validate token" });
}
});

// - List tokens for a session --------------------------------
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
if (req.user.role === "lecturer") sessionFilter.createdBy = req.user._id;
const session = await AttendanceSession.findOne(sessionFilter);
if (!session) return res.status(404).json({ error: "Attendance session not found or access denied" });


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
