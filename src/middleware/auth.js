const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const authenticate = async (req, res, next) => {
  try {
    // Accept token from Authorization header. Query-string tokens are only
    // allowed on file-download paths where setting a header is impossible
    // (e.g. /api/.../export, /api/.../download, /api/.../csv).
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.query.token) {
      const path = req.originalUrl || req.url || "";
      const isDownload = /\/(export|download|csv|pdf|report|attachment)/i.test(path);
      if (isDownload) {
        token = req.query.token;
      } else {
        return res.status(401).json({ error: "No token provided" });
      }
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

    const EXEMPT = ['/api/payments', '/api/auth/logout', '/api/auth/login', '/api/auth/me'];
    const fullPath = (req.originalUrl || req.url || '').split('?')[0];
    const isExempt = EXEMPT.some(p => fullPath.startsWith(p));

    if (!isExempt) {
      const now = Date.now();

      // ── Lecturers / managers / admins ─────────────────────────────────────
      // Blocked when personal trial AND personal subscription AND company access all expired.
      if (['lecturer', 'manager', 'admin'].includes(user.role)) {
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const personalActive = (trialEnd > now) || (subEnd && subEnd > now);

        let companyActive = false;
        if (!personalActive && user.company) {
          try {
            const Company = require('../models/Company');
            const co = await Company.findById(user.company).select('hasAccess subscriptionActive trialEndDate').lean();
            if (co) {
              const cEnd = co.trialEndDate ? new Date(co.trialEndDate) : null;
              companyActive = !!(co.hasAccess || co.subscriptionActive || (cEnd && cEnd > now));
            }
          } catch (_) {}
        }

        if (!personalActive && !companyActive) {
          return res.status(403).json({
            error: 'Subscription expired',
            message: 'Your free trial has ended. Please subscribe to continue using DIKLY.',
            subscriptionExpired: true,
            userSubscription: true,
          });
        }
      }

      // ── Students ───────────────────────────────────────────────────────────
      // Each student gets a personal 45-day trial from account creation,
      // then must pay ₵20/semester individually.
      if (user.role === 'student') {
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 45 * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const active = (trialEnd > now) || (subEnd && subEnd > now);

        if (!active) {
          return res.status(403).json({
            error: 'Subscription expired',
            message: 'Your 45-day free trial has ended. Pay ₵20 to continue for the semester.',
            subscriptionExpired: true,
            userSubscription: true,
            role: 'student',
          });
        }
      }

      // ── Employees ──────────────────────────────────────────────────────────
      // Covered by company trial/subscription while it is active.
      // After that, each employee must pay ₵15/month individually.
      if (user.role === 'employee') {
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const personalActive = subEnd && subEnd > now;

        let companyActive = false;
        if (!personalActive && user.company) {
          try {
            const Company = require('../models/Company');
            const co = await Company.findById(user.company).select('subscriptionActive trialEndDate').lean();
            if (co) {
              const cEnd = co.trialEndDate ? new Date(co.trialEndDate) : null;
              companyActive = !!(co.subscriptionActive || (cEnd && cEnd > now));
            }
          } catch (_) {}
        }

        if (!personalActive && !companyActive) {
          return res.status(403).json({
            error: 'Subscription expired',
            message: 'The company trial has ended. Pay ₵15/month to continue access.',
            subscriptionExpired: true,
            userSubscription: true,
            role: 'employee',
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
