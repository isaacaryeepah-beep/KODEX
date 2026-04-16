"use strict";

/**
 * requireCompanyScope
 *
 * An enhanced tenant-isolation middleware that builds on the existing
 * `authenticate` + `companyIsolation` chain.
 *
 * Responsibilities (in order):
 *  1. Assert that req.user exists (authenticate must have run first).
 *  2. Assert the user has a company reference (superadmins are exempted).
 *  3. Load (and cache on req) the full Company document once per request.
 *  4. Assert the company is active (isActive === true).
 *  5. Assert the company's subscription/trial is not fully lapsed.
 *  6. Attach convenience properties:
 *       req.companyId     — raw ObjectId
 *       req.company       — full Company document
 *       req.companyFilter — { company: req.companyId } for scoped queries
 *       req.tenantMode    — "academic" | "corporate" | "both"
 *
 * Usage
 * ─────
 *   router.use(authenticate, requireCompanyScope);
 *
 *   // Or inline on a single route:
 *   router.get("/my-route", authenticate, requireCompanyScope, handler);
 *
 * Superadmin bypass
 * ─────────────────
 *   Superadmin users skip all tenant checks and receive:
 *     req.companyId     = null
 *     req.company       = null
 *     req.companyFilter = {}
 *     req.tenantMode    = null
 */

const Company = require("../models/Company");

// ---------------------------------------------------------------------------
// Helper: is the company's access window still open?
// ---------------------------------------------------------------------------

function companyHasAccess(company) {
  if (company.subscriptionActive) return true;
  const now = new Date();
  if (
    !company.trialUsed &&
    company.trialEndDate &&
    now <= company.trialEndDate
  ) {
    return true;
  }
  // subscriptionEndDate check (covers Paystack / Stripe billing cycles)
  if (
    company.subscriptionStatus === "active" &&
    company.subscriptionEndDate &&
    now <= company.subscriptionEndDate
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

const requireCompanyScope = async (req, res, next) => {
  try {
    // authenticate must run before this middleware.
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Superadmin: platform-wide access, no tenant binding.
    if (req.user.role === "superadmin") {
      req.companyId     = null;
      req.company       = null;
      req.companyFilter = {};
      req.tenantMode    = null;
      return next();
    }

    // All other users must belong to a company.
    if (!req.user.company) {
      return res.status(403).json({ error: "User is not assigned to an organisation" });
    }

    // Load company (may already be cached on req by earlier middleware).
    if (!req.company || req.company._id.toString() !== req.user.company.toString()) {
      req.company = await Company.findById(req.user.company);
    }

    if (!req.company) {
      return res.status(403).json({ error: "Organisation not found" });
    }

    // Hard block: company deactivated by superadmin.
    if (!req.company.isActive) {
      return res.status(403).json({
        error: "This organisation account is inactive. Please contact support.",
      });
    }

    // Soft block: subscription/trial fully lapsed.
    // Route-level bypass is handled via a separate `requireActiveSubscription`
    // middleware — we don't hard-gate here so auth/payment routes still work.
    // We do attach a flag so downstream handlers can decide.
    req.companyHasAccess = companyHasAccess(req.company);

    // Attach tenant convenience fields.
    req.companyId     = req.user.company;
    req.companyFilter = { company: req.companyId };
    req.tenantMode    = req.company.mode; // "academic" | "corporate" | "both"

    next();
  } catch (err) {
    console.error("[requireCompanyScope]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// Variant: requireCompanyMode
//
// Enforce that the authenticated user's company operates in the expected mode.
//
// Usage:
//   router.use(authenticate, requireCompanyScope, requireCompanyMode("academic"));
// ---------------------------------------------------------------------------

const requireCompanyMode = (expectedMode) => (req, res, next) => {
  // Superadmin bypasses mode checks.
  if (req.user?.role === "superadmin") return next();

  const mode = req.tenantMode || req.company?.mode;
  if (!mode) {
    return res.status(403).json({ error: "Organisation mode could not be determined" });
  }

  if (mode !== expectedMode && mode !== "both") {
    return res.status(403).json({
      error: `This feature requires ${expectedMode} mode. Your organisation is in ${mode} mode.`,
    });
  }
  next();
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { requireCompanyScope, requireCompanyMode };
