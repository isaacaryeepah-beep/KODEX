const crypto = require('crypto');

/**
 * Generate a secure, unique Jitsi room name
 * Format: kodex_{shortCompanyId}_{shortMeetingRef}_{randomHash}
 * Example: kodex_a1b2c3_m4d5e6_x8j4pq
 */
exports.generateRoomName = (companyId, meetingRef = '') => {
  const companyShort  = String(companyId).slice(-6);
  const meetingShort  = meetingRef ? String(meetingRef).slice(-6) : '';
  const randomHash    = crypto.randomBytes(4).toString('hex');
  const parts         = ['kodex', companyShort, meetingShort, randomHash].filter(Boolean);
  return parts.join('_').toLowerCase();
};
