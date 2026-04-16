"use strict";

/**
 * faq.js
 * Mounted at: /api/faq   (registered in server.js)
 *
 * AI FAQ Assistant — knowledge base queries, AI fallback, helpdesk escalation.
 * No requireMode() — serves both academic and corporate tenants.
 *
 * Route summary
 * -------------
 * Public knowledge-base endpoints (any authenticated user)
 *   GET    /categories                list valid FAQ categories (static)
 *   GET    /                          paginated FAQ list  [role-filtered]
 *   GET    /:id                       single FAQ entry
 *
 * Chat endpoints (any authenticated user)
 *   POST   /ask                       submit question → FAQ lookup → AI fallback
 *   POST   /escalate/:queryId         escalate unresolved query to support ticket
 *   PATCH  /rate/:queryId             rate answer helpful / not-helpful
 *
 * Admin endpoints  [admin, superadmin]
 *   GET    /admin/stats               aggregate FAQ + query statistics
 *   GET    /admin/queries             paginated query log with filters
 *   POST   /admin/promote/:queryId    promote AI answer to FAQ knowledge base
 *   POST   /                          create a new FAQ entry
 *   PATCH  /:id                       update an FAQ entry
 *   DELETE /:id                       deactivate an FAQ entry
 *
 * Route order: /categories, /ask, /admin/*, /escalate/*, /rate/* all declared
 * BEFORE /:id to prevent Express parameter shadowing.
 */

const express = require("express");
const router  = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/faqController");
const { FAQ_CATEGORIES } = require("../models/FAQ");

// ── Middleware ───────────────────────────────────────────────────────────────
const mw    = [authenticate, requireActiveSubscription, companyIsolation];
const ADMIN = ["admin", "superadmin"];

// ════════════════════════════════════════════════════════════════════════════
// Static / literal routes — MUST be declared before /:id
// ════════════════════════════════════════════════════════════════════════════

// GET /categories — static list, no DB call needed
router.get("/categories", ...mw, (req, res) => {
  res.json({ categories: FAQ_CATEGORIES });
});

// ── Admin analytics — declared before /:id ───────────────────────────────────
router.get("/admin/stats",   ...mw, requireRole(...ADMIN), ctrl.getStats);
router.get("/admin/queries", ...mw, requireRole(...ADMIN), ctrl.getQueries);
router.post("/admin/promote/:queryId", ...mw, requireRole(...ADMIN), ctrl.promoteToFAQ);

// ── Chat endpoints — declared before /:id ────────────────────────────────────
router.post("/ask",                ...mw, ctrl.ask);
router.post("/escalate/:queryId",  ...mw, ctrl.escalate);
router.patch("/rate/:queryId",     ...mw, ctrl.rateAnswer);

// ════════════════════════════════════════════════════════════════════════════
// Collection routes
// ════════════════════════════════════════════════════════════════════════════

router.get("/",  ...mw, ctrl.listFAQs);
router.post("/", ...mw, requireRole(...ADMIN), ctrl.createFAQ);

// ════════════════════════════════════════════════════════════════════════════
// /:id routes — MUST be last
// ════════════════════════════════════════════════════════════════════════════

router.get("/:id",    ...mw, ctrl.getFAQ);
router.patch("/:id",  ...mw, requireRole(...ADMIN), ctrl.updateFAQ);
router.delete("/:id", ...mw, requireRole(...ADMIN), ctrl.deleteFAQ);

module.exports = router;
