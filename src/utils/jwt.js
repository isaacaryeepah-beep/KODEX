const jwt = require("jsonwebtoken");

// ── Token expiry ──────────────────────────────────────────────────────────────
// Access tokens expire in 7 days by default (configurable via .env)
const ACCESS_TOKEN_EXPIRY = process.env.JWT_EXPIRES_IN || "7d";

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set in environment variables!");
  }
  return jwt.sign(
    { id: userId, type: "access" },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

const verifyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set in environment variables!");
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Reject tokens that weren't generated as access tokens
  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }
  return decoded;
};

module.exports = { generateToken, verifyToken };
