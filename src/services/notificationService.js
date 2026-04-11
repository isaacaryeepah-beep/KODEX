/**
 * Notification Service
 * Currently handles in-app notifications.
 * Structured for easy extension to push, email, SMS.
 */

// In-app notification model (create this model if you don't have one)
// const Notification = require('../../models/Notification');

/**
 * Fire notifications for a new announcement
 * @param {Object} announcement - saved Announcement document
 * @param {Array}  recipientIds - array of user ObjectIds
 */
exports.notifyRecipients = async (announcement, recipientIds) => {
  try {
    await Promise.allSettled([
      inAppNotify(announcement, recipientIds),
      // pushNotify(announcement, recipientIds),   // add later
      // emailNotify(announcement, recipientIds),   // add later
      // smsNotify(announcement, recipientIds),     // add later
    ]);
  } catch (err) {
    console.error('[Notification] Error sending notifications:', err.message);
  }
};

// ─── IN-APP ──────────────────────────────────────────────────────────────────
async function inAppNotify(announcement, recipientIds) {
  // TODO: insert into your Notification collection
  // Example:
  // const docs = recipientIds.map(userId => ({
  //   userId,
  //   companyId: announcement.companyId,
  //   type: 'announcement',
  //   refId: announcement._id,
  //   title: announcement.title,
  //   message: announcement.message.substring(0, 100),
  //   priority: announcement.priority,
  //   isRead: false
  // }));
  // await Notification.insertMany(docs, { ordered: false });
  console.log(`[Notification] In-app: ${recipientIds.length} users notified for announcement ${announcement._id}`);
}

// ─── PUSH (STUB) ─────────────────────────────────────────────────────────────
// async function pushNotify(announcement, recipientIds) {
//   // Use FCM, Expo, or OneSignal here
// }

// ─── EMAIL (STUB) ─────────────────────────────────────────────────────────────
// async function emailNotify(announcement, recipientIds) {
//   // Use MailerSend, SendGrid, etc.
// }

// ─── SMS (STUB) ───────────────────────────────────────────────────────────────
// async function smsNotify(announcement, recipientIds) {
//   // Use Arkesel, Twilio, etc.
// }
