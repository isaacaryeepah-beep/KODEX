/**
 * networkVerificationService.js
 *
 * Modular, optional school Wi-Fi / network verification.
 *
 * IMPORTANT DESIGN PRINCIPLE:
 *   Wi-Fi alone is NOT sufficient anti-cheat proof.
 *   This is a SUPPORTING signal only — not the primary attendance proof.
 *   The primary proof chain is:
 *     enrollment + active session + ESP32 heartbeat + rotating code
 *   Network check adds an optional layer on top.
 *
 * Currently supports:
 *   - Subnet-based IP matching (school NAT detection)
 *   - AP SSID matching
 *   - Device-reported network status
 *
 * Future-ready hooks for:
 *   - UniFi controller API
 *   - Cisco Meraki API
 *   - Aruba ClearPass
 *   - MikroTik RouterOS API
 *   - Omada Cloud API
 *   - Classroom AP mapping
 */

const Device = require('../models/Device');

// Network enforcement states
const NETWORK_STATUS = {
  APPROVED:    'approved',
  UNVERIFIED:  'unverified',
  DISABLED:    'disabled',
  BLOCKED:     'blocked',
};

/**
 * Verify whether a student's request IP is within the approved
 * school network subnets for the given company.
 *
 * @param {string} ipAddress   - Student's request IP (after trust proxy)
 * @param {string} companyId   - Tenant ID
 * @returns {Promise<{status, method, detail}>}
 */
async function verifyNetworkAccess(ipAddress, companyId) {
  try {
    // Fetch device for this company to get allowedSubnets
    const device = await Device.findOne({ companyId, isActive: true })
      .select('allowedSubnets apSSID assignedRoom')
      .lean();

    if (!device) {
      return {
        status:  NETWORK_STATUS.UNVERIFIED,
        method:  'no_device',
        detail:  'No classroom device registered for this institution.',
      };
    }

    if (!device.allowedSubnets || device.allowedSubnets.length === 0) {
      return {
        status:  NETWORK_STATUS.DISABLED,
        method:  'no_subnets',
        detail:  'Network verification is not configured for this institution.',
      };
    }

    // Normalise IP — strip IPv6 prefix from IPv4-mapped addresses
    const ip = (ipAddress || '').replace(/^::ffff:/, '').trim();

    // Check if request IP starts with any approved subnet prefix
    const matched = device.allowedSubnets.some(subnet => ip.startsWith(subnet));

    if (matched) {
      return {
        status:  NETWORK_STATUS.APPROVED,
        method:  'subnet_match',
        detail:  `IP ${ip} matched approved school subnet.`,
        apSSID:  device.apSSID,
        room:    device.assignedRoom,
      };
    }

    return {
      status:  NETWORK_STATUS.UNVERIFIED,
      method:  'subnet_mismatch',
      detail:  `IP ${ip} is not on the approved school network.`,
    };
  } catch (err) {
    console.error('[NetworkVerification] error:', err.message);
    return {
      status:  NETWORK_STATUS.UNVERIFIED,
      method:  'error',
      detail:  'Network verification check failed.',
    };
  }
}

/**
 * Get the current network enforcement config for a session.
 * Returns whether enforcement is enabled and what the current threshold is.
 */
function getNetworkEnforcementConfig(session) {
  return {
    enforced:    session.networkEnforcement === true,
    status:      session.networkStatus || NETWORK_STATUS.DISABLED,
    lastChecked: session.networkLastChecked || null,
  };
}

/**
 * Hook stub for future managed controller integration.
 * Extend this function to call UniFi / Meraki / Aruba APIs.
 *
 * @param {string} companyId
 * @param {string} controllerType - 'unifi' | 'meraki' | 'aruba' | 'mikrotik' | 'omada'
 */
async function getControllerNetworkData(companyId, controllerType = 'unifi') {
  // TODO: Implement per-controller type
  // UniFi: GET https://<unifi-host>/api/s/<site>/stat/sta
  // Meraki: GET https://api.meraki.com/api/v1/networks/<id>/clients
  // Return: { clients: [], apMappings: [], classroomPresence: {} }

  console.warn(`[NetworkVerification] Controller integration (${controllerType}) not yet implemented for company ${companyId}`);
  return { clients: [], apMappings: [], classroomPresence: {} };
}

module.exports = {
  NETWORK_STATUS,
  verifyNetworkAccess,
  getNetworkEnforcementConfig,
  getControllerNetworkData,
};
