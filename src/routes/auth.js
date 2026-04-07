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

    // Block expired lecturers/managers on every API request
    const PAID_ROLES = ['lecturer', 'manager'];
    const EXEMPT = ['/api/payments', '/api/auth/logout', '/api/auth/login'];
    if (PAID_ROLES.includes(user.role)) {
      const isExempt = EXEMPT.some(p => req.path.startsWith(p));
      if (!isExempt) {
        const now = Date.now();
        const trialEnd = user.trialEndDate
          ? new Date(user.trialEndDate)
          : new Date(new Date(user.createdAt).getTime() + 30*24*60*60*1000);
        const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
        if (!(trialEnd > now) && !(subEnd && subEnd > now)) {
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
