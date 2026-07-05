"use strict";

/**
 * webPushService.js
 *
 * Thin wrapper around the `web-push` library for sending real OS-level
 * push notifications (delivered even when the app/tab is closed, via the
 * service worker's `push` event handler — see src/public/sw.js).
 *
 * Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in the
 * environment. If unset, sends are silently skipped (logged once) so local
 * dev without push configured doesn't crash — mirrors the pattern used by
 * emailService.js / smsService.js for optional providers.
 */

const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

let configured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@dikly.sbs",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
  console.log("[WebPush] ✓ Configured");
} else {
  console.warn("[WebPush] VAPID keys not set — push sends will be skipped");
}

/**
 * Send a push payload to every subscription a user has registered
 * (one per device/browser). Expired/invalid subscriptions (410/404) are
 * removed automatically. Fire-and-forget: never throws.
 *
 * @param {ObjectId|string} userId
 * @param {Object} payload — { title, body, url?, tag? }
 */
async function sendToUser(userId, payload) {
  if (!configured) return { sent: 0, skipped: true };
  const subs = await PushSubscription.find({ user: userId }).lean();
  if (!subs.length) return { sent: 0, skipped: false };

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        body
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or was revoked on the client — clean it up.
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      } else {
        console.error(`[WebPush] send failed for user ${userId}:`, err.message);
      }
    }
  }));
  return { sent, skipped: false };
}

module.exports = { sendToUser, isConfigured: () => configured };
