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

    req.user = user;

    // ── Per-lecturer subscription check ─────────────────────────────────────
    // Block lecturers/managers with expired personal subscriptions on every request
    // Students, employees, HODs are always free
    const PAID_ROLES = ['lecturer', 'manager'];
    const EXEMPT_PATHS = [
      '/api/payments',      // allow subscription page to load
      '/api/auth/logout',   // allow logout
      '/api/auth/login',    // allow login
    ];

    if (PAID_ROLES.includes(user.role)) {
      const isExempt = EXEMPT_PATHS.some(p => req.path.startsWith(p));
      if (!isExempt) {
        const now = Date.now();
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        const trialActive = trialEnd > now;
        const subActive   = subEnd && subEnd > now;

        if (!trialActive && !subActive) {
          return res.status(403).json({
            error: 'Subscription expired',
            message: 'Your free trial has ended. Please subscribe to continue using KODEX.',
            subscriptionExpired: true,
            userSubscription: true,
          });
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

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
