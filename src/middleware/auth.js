const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const { getStudentTrialDays } = require("../utils/trialSettings");

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
      // notifications/stream: the bell-icon SSE feed (app.js startSSE) — like
      // the other two, EventSource can't set an Authorization header, so its
      // token has to travel in the query string. Missing here meant every
      // SSE connection got a 401 "No token provided" despite a valid token
      // being sent, confirmed via repeated 401s in a live browser console.
      const isStream   = /\/(monitor\/stream|participant-stream|notifications\/stream)/.test(path);
      if (isDownload || isStream) {
        token = req.query.token;
      } else {
        return res.status(401).json({ error: "No token provided" });
      }
    } else {
      return res.status(401).json({ error: "No token provided" });
    }
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).maxTimeMS(8000);
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

      // ── Institution coverage — computed once, used by every role below.
      // Defaults to true (fail open) when there's no company to check, or
      // the lookup fails/finds nothing — a transient DB hiccup shouldn't
      // lock out an entire institution.
      let companyOk = true;
      if (user.company) {
        try {
          const Company = require('../models/Company');
          const co = await Company.findById(user.company)
            .select('subscriptionActive subscriptionStatus trialEndDate subscriptionEndDate')
            .lean()
            .maxTimeMS(5000);
          if (co) {
            const status   = co.subscriptionStatus || '';
            const trialEnd = co.trialEndDate        ? new Date(co.trialEndDate)        : null;
            const subEnd   = co.subscriptionEndDate ? new Date(co.subscriptionEndDate) : null;

            // Use subscriptionStatus as the authority.
            // 'active'  → paid plan; also check end date hasn't passed (+ grace).
            // 'trial'   → only OK when trialEndDate is still in the future (+ grace).
            // anything else ('expired', 'inactive', 'past_due', '') → blocked.
            if (status === 'active' || co.subscriptionActive) {
              companyOk = !subEnd || (subEnd.getTime() + GRACE_MS) > now;
            } else if (status === 'trial') {
              companyOk = !!(trialEnd && (trialEnd.getTime() + GRACE_MS) > now);
            } else {
              companyOk = false;
            }
          }
        } catch (err) {
          console.error('[auth] company subscription check failed:', err.message);
        }
      }

      // ── Company-covered roles (lecturer / manager / hod / admin / employee) ──
      // Company coverage (subscription or trial) always wins for these roles —
      // none of them are gated by their own signup-time trial while their
      // institution covers them. Only once company coverage has genuinely
      // lapsed does a real PAID personal subscription offer a bypass. This
      // mirrors requireActiveSubscription's exact precedence and the
      // userTrial banner computed in authController.js, so all three now
      // agree on when an account is actually locked — previously this check
      // ran unconditionally (even with valid company coverage) against each
      // person's own hardcoded 30-day trial window, so an admin/lecturer
      // could see "Trial Expired" while every feature kept working, or in
      // principle be blocked here despite their institution being fully
      // paid up.
      if (['lecturer', 'manager', 'admin', 'hod', 'employee'].includes(user.role) && !companyOk) {
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const personalOk = !!(subEnd && (subEnd.getTime() + GRACE_MS) > now);
        if (!personalOk) {
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

      // ── Students — always individual: a per-signup trial then per-semester
      // payment, regardless of any institution's own subscription status.
      if (user.role === 'student') {
        const trialDays = await getStudentTrialDays();
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const active = ((trialEnd.getTime() + GRACE_MS) > now) || (subEnd && (subEnd.getTime() + GRACE_MS) > now);

        if (!active) {
          return res.status(402).json({
            error: 'Subscription expired',
            subscriptionExpired: true,
            isAdmin: false,
            message: `Your ${trialDays}-day free trial has ended. Pay ₵20 to continue for the semester.`,
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
