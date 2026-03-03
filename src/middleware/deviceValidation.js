const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const validateDevice = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const requestDeviceId = req.body.deviceId || req.headers["x-device-id"];

  if (!requestDeviceId) {
    return res.status(400).json({ error: "Device ID is required" });
  }

  if (req.user.deviceId && req.user.deviceId !== requestDeviceId) {
    return res.status(403).json({
      error: "Device mismatch",
      message: "This account is registered to a different device. Please log in from the registered device.",
    });
  }

  next();
};

const enforceLogoutRestriction = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.lastLogoutTime) {
    const timeSinceLogout = Date.now() - new Date(req.user.lastLogoutTime).getTime();
    if (timeSinceLogout < SIX_HOURS_MS) {
      const remainingMs = SIX_HOURS_MS - timeSinceLogout;
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      return res.status(403).json({
        error: "Action restricted after logout",
        message: `You must wait ${remainingHours} hour(s) after logout before performing this action`,
        restrictedUntil: new Date(
          new Date(req.user.lastLogoutTime).getTime() + SIX_HOURS_MS
        ).toISOString(),
      });
    }
  }

  next();
};

module.exports = { validateDevice, enforceLogoutRestriction, SIX_HOURS_MS };
