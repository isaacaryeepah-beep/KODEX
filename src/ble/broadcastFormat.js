const { BROADCAST_PREFIX, BROADCAST_VERSION } = require("./constants");

const toBase64 = (str) => {
  if (typeof btoa === "function") {
    return btoa(str);
  }
  return Buffer.from(str, "utf-8").toString("base64");
};

const fromBase64 = (b64) => {
  if (typeof atob === "function") {
    return atob(b64);
  }
  return Buffer.from(b64, "base64").toString("utf-8");
};

const encodeBroadcastPayload = ({ sessionId, companyId, token, code, timestamp }) => {
  const payload = {
    prefix: BROADCAST_PREFIX,
    version: BROADCAST_VERSION,
    sessionId,
    companyId,
    token,
    code,
    timestamp: timestamp || Date.now(),
  };

  return toBase64(JSON.stringify(payload));
};

const decodeBroadcastPayload = (base64Data) => {
  try {
    const json = fromBase64(base64Data);
    const payload = JSON.parse(json);

    if (payload.prefix !== BROADCAST_PREFIX) {
      return { valid: false, error: "Invalid broadcast prefix" };
    }

    if (payload.version !== BROADCAST_VERSION) {
      return { valid: false, error: `Unsupported broadcast version: ${payload.version}` };
    }

    if (!payload.sessionId || !payload.companyId || !payload.token || !payload.code) {
      return { valid: false, error: "Missing required fields in broadcast payload" };
    }

    if (!/^\d{6}$/.test(payload.code)) {
      return { valid: false, error: "Invalid code format, expected 6-digit numeric" };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: `Failed to decode broadcast: ${error.message}` };
  }
};

const createAdvertisementData = ({ sessionId, companyId, token, code }) => {
  const payload = encodeBroadcastPayload({ sessionId, companyId, token, code });

  return {
    serviceUUIDs: [require("./constants").BLE_SERVICE_UUID],
    localName: `${BROADCAST_PREFIX}_${code}`,
    manufacturerData: payload,
  };
};

module.exports = {
  encodeBroadcastPayload,
  decodeBroadcastPayload,
  createAdvertisementData,
};
