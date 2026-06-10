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
      // Query-param token allowed for download paths and SSE streams
      // (both cases cannot send an Authorization header)
      const isDownload = /\/(export|download|csv|pdf|report|attachment)/i.test(path);
      const isStream   = /\/(monitor\/stream|participant-stream)/.test(path);
      if (isDownload || isStream) {
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
    if (user.isSuspended) {
      return res.status(403).json({ error: "Account suspended. Contact your administrator." });
    }

    req.user = user;

    // Paths exempt from subscription enforcement (auth, payments, profile)
    const EXEMPT = ['/api/payments', '/api/auth/logout', '/api/auth/login', '/api/auth/me', '/api/auth/refresh'];
    const fullPath = (req.originalUrl || req.url || '').split('?')[0];
    const isExempt = EXEMPT.some(p => fullPath.startsWith(p));

    if (!isExempt && user.role !== 'superadmin') {
      const now = Date.now();
      // 3-day grace period — buffer for payment processing delays
      const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

      // ── Institution-wide check (all non-superadmin roles) ─────────────────
      // When the company's trial and paid subscription have both expired, every
      // user in that institution is blocked. Admin still passes so they can
      // reach the subscription/payment pages to renew.
      if (user.company) {
        try {
          const Company = require('../models/Company');
          const co = await Company.findById(user.company)
            .select('subscriptionActive subscriptionStatus trialEndDate subscriptionEndDate')
            .lean();
          if (co) {
            const status   = co.subscriptionStatus || '';
            const trialEnd = co.trialEndDate        ? new Date(co.trialEndDate)        : null;
            const subEnd   = co.subscriptionEndDate ? new Date(co.subscriptionEndDate) : null;

            // Use subscriptionStatus as the authority.
            // 'active'  → paid plan; also check end date hasn't passed (+ grace).
            // 'trial'   → only OK when trialEndDate is still in the future (+ grace).
            // anything else ('expired', 'inactive', 'past_due', '') → blocked.
            let companyOk = false;
            if (status === 'active' || co.subscriptionActive) {
              companyOk = !subEnd || (subEnd.getTime() + GRACE_MS) > now;
            } else if (status === 'trial') {
              companyOk = !!(trialEnd && (trialEnd.getTime() + GRACE_MS) > now);
            }
            // 'expired' / 'inactive' / 'past_due' / unknown → companyOk stays false

            if (!companyOk) {
              const isAdmin = user.role === 'admin';
              return res.status(402).json({
                error: 'Subscription expired',
                subscriptionExpired: true,
                isAdmin,
                message: isAdmin
                  ? 'Your institution\'s subscription has expired. Renew now to restore access for all users.'
                  : 'Your institution\'s subscription has expired. Contact your admin to renew.',
              });
            }
          }
        } catch (err) {
          console.error('[auth] company subscription check failed:', err.message);
        }
      }

      // ── Per-user checks (roles that pay individually) ──────────────────────

      // Lecturers / managers / HODs / admins — personal trial or subscription
      if (['lecturer', 'manager', 'admin', 'hod'].includes(user.role)) {
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const personalOk = ((trialEnd.getTime() + GRACE_MS) > now)
          || (subEnd && (subEnd.getTime() + GRACE_MS) > now);

        if (!personalOk) {
          return res.status(402).json({
            error: 'Subscription expired',
            subscriptionExpired: true,
            isAdmin: user.role === 'admin',
            message: user.role === 'admin'
              ? 'Your subscription has expired. Renew to restore access.'
              : 'Your free trial has ended. Please subscribe to continue using DIKLY.',
          });
        }
      }

      // Students — personal 45-day trial then individual payment
      if (user.role === 'student') {
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 45 * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const active = ((trialEnd.getTime() + GRACE_MS) > now) || (subEnd && (subEnd.getTime() + GRACE_MS) > now);

        if (!active) {
          return res.status(402).json({
            error: 'Subscription expired',
            subscriptionExpired: true,
            isAdmin: false,
            message: 'Your 45-day free trial has ended. Pay ₵20 to continue for the semester.',
          });
        }
      }

      // Employees — covered by company plan; individual fallback above already handled
      if (user.role === 'employee') {
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        if (subEnd && (subEnd.getTime() + GRACE_MS) <= now) {
          return res.status(402).json({
            error: 'Subscription expired',
            subscriptionExpired: true,
            isAdmin: false,
            message: 'Your access has expired. Contact your company admin.',
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
