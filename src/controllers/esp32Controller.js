const Company  = require('../models/Company');
const crypto   = require('crypto');

// ── How long before we consider the ESP32 offline ─────────
const OFFLINE_THRESHOLD_MS = 15000; // 15 seconds

// ── POST /api/esp32/register ───────────────────────────────
// ESP32 calls this once on boot to register itself.
// Returns a token the ESP32 uses for all future poll calls.
exports.register = async (req, res) => {
  try {
    const secret = req.headers['x-esp32-secret'];
    if (!secret || secret !== process.env.ESP32_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { institutionCode } = req.body;
    if (!institutionCode) {
      return res.status(400).json({ error: 'institutionCode required' });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: 'Institution not found: ' + institutionCode });
    }

    // Generate a token for this ESP32 if it doesn't have one
    if (!company.esp32Token) {
      company.esp32Token = crypto.randomBytes(24).toString('hex');
    }
    company.esp32Online   = true;
    company.esp32LastSeen = new Date();
    await company.save();

    console.log(`[ESP32] Registered for institution: ${institutionCode}`);
    res.json({ ok: true, token: company.esp32Token, institutionCode: company.institutionCode });
  } catch (e) {
    console.error('[ESP32] Register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/esp32/poll ────────────────────────────────────
// ESP32 calls this every 5 seconds.
// Returns any pending command (start/stop) and clears it.
exports.poll = async (req, res) => {
  try {
    const token = req.headers['x-esp32-token'];
    if (!token) return res.status(401).json({ error: 'Token required' });

    const company = await Company.findOne({ esp32Token: token });
    if (!company) return res.status(401).json({ error: 'Unknown ESP32 token' });

    // Mark as online
    company.esp32Online   = true;
    company.esp32LastSeen = new Date();

    // Pick up and clear any pending command
    const command = company.esp32PendingCommand || null;
    if (command) {
      company.esp32PendingCommand = null;
    }

    await company.save();

    res.json({ ok: true, command });  // command is null if nothing pending
  } catch (e) {
    console.error('[ESP32] Poll error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/esp32/status ─────────────────────────────────
// App calls this to check if ESP32 is online for this company
exports.status = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select('esp32Online esp32LastSeen');
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Consider offline if not seen in 15 seconds
    const online = company.esp32Online &&
      company.esp32LastSeen &&
      (Date.now() - new Date(company.esp32LastSeen).getTime() < OFFLINE_THRESHOLD_MS);

    res.json({ online, lastSeen: company.esp32LastSeen });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
