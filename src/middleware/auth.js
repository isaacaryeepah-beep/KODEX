const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
  try {
    // Accept token from Authorization header OR query string (for file downloads)
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    } else {
      return res.status(401).json({ error: "No token provided" });
    }
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found or inactive" });
    }
    if (user.isLocked) {
      return res.status(403).json({
        error: "Account locked",
        message: user.lockReason || "Your account has been locked. Contact your department HOD to unlock it.",
        accountLocked: true,
      });
    }

    req.user = user;

    // Block expired lecturers/managers/admins on every API request.
    // Admins are included so an expired institution actually locks the
    // account — but the gate still shows the Pay button so they can renew.
    const PAID_ROLES = ['lecturer', 'manager', 'admin'];
    // NOTE: req.path is RELATIVE to the router's mount point (e.g. "/paystack/initialize"
    // inside routes/payments.js), so we have to test against req.originalUrl which is
    // the full URL path. Otherwise the exemption never matches and expired lecturers
    // get 403'd even on the Paystack initialize call — making it impossible to pay.
    const EXEMPT = ['/api/payments', '/api/auth/logout', '/api/auth/login', '/api/auth/me'];
    if (PAID_ROLES.includes(user.role)) {
      const fullPath = (req.originalUrl || req.url || '').split('?')[0];
      const isExempt = EXEMPT.some(p => fullPath.startsWith(p));
      if (!isExempt) {
        const now = Date.now();
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 30*24*60*60*1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const personalActive = (trialEnd > now) || (subEnd && subEnd > now);

        // Also let them through if their COMPANY still has access (paid by
        // someone else, e.g. an institution-wide subscription). Only block
        // when BOTH personal and company access are gone.
        let companyActive = false;
        if (!personalActive && user.company) {
          try {
            const Company = require('../models/Company');
            const company = await Company.findById(user.company).select('hasAccess subscriptionActive isTrialActive trialEndDate').lean();
            if (company) {
              const cTrialEnd = company.trialEndDate ? new Date(company.trialEndDate) : null;
              companyActive = !!(company.hasAccess || company.subscriptionActive || (cTrialEnd && cTrialEnd > now));
            }
          } catch (_) {}
        }

        if (!personalActive && !companyActive) {
          return res.status(403).json({
            error: 'Subscription expired',
            message: 'Your free trial has ended. Please subscribe to continue using KODEX.',
            subscriptionExpired: true,
            userSubscription: true,
          });
        }
      }
    }

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(500).json({ error: "Authentication failed" });
  }
};

module.exports = authenticate;
