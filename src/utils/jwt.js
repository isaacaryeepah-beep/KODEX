const jwt    = require("jsonwebtoken");
const crypto = require("crypto");

// Hash a refresh token for safe DB storage (so a DB breach doesn't yield live tokens)
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// ── Token expiry ──────────────────────────────────────────────────────────────
// Access tokens: 15 min. Refresh tokens: 30 days.
// Clients call POST /api/auth/refresh before the access token expires.
// Old deployments may still have JWT_EXPIRES_IN="7d" in .env — that env var
// now controls access token expiry, keeping backward compatibility.
const ACCESS_TOKEN_EXPIRY  = process.env.JWT_EXPIRES_IN         || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

const _secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set in environment variables!");
  return process.env.JWT_SECRET;
};

// Refresh tokens use a dedicated secret so a leaked access token cannot be used
// to forge refresh tokens. Falls back to JWT_SECRET suffixed with "-refresh" so
// existing single-secret deployments continue to work after rotation.
const _refreshSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set in environment variables!");
  return process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET + "-refresh");
};

const generateToken = (userId) =>
  jwt.sign({ id: userId, type: "access" }, _secret(), { expiresIn: ACCESS_TOKEN_EXPIRY });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId, type: "refresh" }, _refreshSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });

const verifyToken = (token) => {
  const decoded = jwt.verify(token, _secret());
  // Accept old tokens (no type field) for backward compat with existing sessions.
  if (decoded.type && decoded.type !== "access") throw new Error("Invalid token type");
  return decoded;
};

const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, _refreshSecret());
  if (decoded.type !== "refresh") throw new Error("Invalid token type");
  return decoded;
};

// ── Meeting access token (short-lived, single-use context) ──────────────────
const generateMeetingToken = (userId, meetingId, deviceId) =>
  jwt.sign(
    { id: userId, meetingId, deviceId: deviceId || null, type: "meeting" },
    _secret(),
    { expiresIn: "30m" }
  );

const verifyMeetingToken = (token) => {
  const decoded = jwt.verify(token, _secret());
  if (decoded.type !== "meeting") throw new Error("Invalid token type");
  return decoded;
};

module.exports = {
  generateToken, generateRefreshToken,
  verifyToken,   verifyRefreshToken,
  generateMeetingToken, verifyMeetingToken,
  hashToken,
};
