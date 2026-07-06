"use strict";

/**
 * apiKeys.js
 * Mounted at: /api/api-keys   (registered in server.js)
 *
 * Admin management of the company's public-API keys (used with /api/v1/*).
 * These routes are for the logged-in web app (JWT auth, admin-only) — the
 * keys they issue are what external integrations use.
 *
 * Route summary
 * -------------
 * GET    /            list this company's keys (never the secret — only prefix)
 * POST   /            create a key; the FULL key appears in this response ONCE
 * DELETE /:id         revoke a key (soft — audit history survives, key dies)
 */

const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const ApiKey = require("../models/ApiKey");
const { API_SCOPES } = require("../models/ApiKey");
const { hashKey } = require("../middleware/apiKeyAuth");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;

const mw = [authenticate, requireRole("admin", "superadmin")];

const MAX_KEYS_PER_COMPANY = 10;

router.get("/", ...mw, async (req, res) => {
  try {
    const keys = await ApiKey.find({ company: req.user.company })
      .select("name prefix scopes revokedAt lastUsedAt requestCount createdAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ keys, scopes: API_SCOPES });
  } catch (e) {
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

router.post("/", ...mw, async (req, res) => {
  try {
    const name = (req.body.name || "").trim();
    const scopes = Array.isArray(req.body.scopes) ? req.body.scopes.filter((s) => API_SCOPES.includes(s)) : [];
    if (!name) return res.status(400).json({ error: "Key name is required (e.g. \"Payroll integration\")" });
    if (!scopes.length) return res.status(400).json({ error: "Select at least one scope" });

    const activeCount = await ApiKey.countDocuments({ company: req.user.company, revokedAt: null });
    if (activeCount >= MAX_KEYS_PER_COMPANY) {
      return res.status(400).json({ error: `Limit of ${MAX_KEYS_PER_COMPANY} active keys reached — revoke one first.` });
    }

    // dk_live_ + 40 hex chars (160 bits of entropy). Shown once, stored hashed.
    const rawKey = `dk_live_${crypto.randomBytes(20).toString("hex")}`;

    const key = await ApiKey.create({
      company: req.user.company,
      name,
      keyHash: hashKey(rawKey),
      prefix: rawKey.slice(0, 12) + "…",
      scopes,
      createdBy: req.user._id,
    });

    AuditLog.record({
      company: req.user.company,
      actor: req.user,
      action: AUDIT_ACTIONS.CREATE,
      resource: "ApiKey",
      resourceId: key._id,
      resourceLabel: `API key "${name}" created (${key.prefix})`,
      metadata: { scopes },
      req,
    });

    res.status(201).json({
      apiKey: rawKey, // the ONLY time the full key is ever returned
      key: { _id: key._id, name: key.name, prefix: key.prefix, scopes: key.scopes, createdAt: key.createdAt },
    });
  } catch (e) {
    console.error("[api-keys] create failed:", e.message);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

router.delete("/:id", ...mw, async (req, res) => {
  try {
    const key = await ApiKey.findOne({ _id: req.params.id, company: req.user.company });
    if (!key) return res.status(404).json({ error: "API key not found" });
    if (key.revokedAt) return res.status(400).json({ error: "This key is already revoked" });

    key.revokedAt = new Date();
    await key.save();

    AuditLog.record({
      company: req.user.company,
      actor: req.user,
      action: AUDIT_ACTIONS.DELETE,
      resource: "ApiKey",
      resourceId: key._id,
      resourceLabel: `API key "${key.name}" revoked (${key.prefix})`,
      req,
    });

    res.json({ message: "API key revoked — it stops working immediately." });
  } catch (e) {
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

module.exports = router;
