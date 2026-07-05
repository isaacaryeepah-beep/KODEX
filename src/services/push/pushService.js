"use strict";

/**
 * pushService.js
 *
 * Public facade for sending a push notification to a user, independent of
 * which transport their device is actually subscribed through. Today every
 * PushSubscription is `provider: "webpush"` (browser Web Push via VAPID —
 * see providers/webPushProvider.js), since Flutter development is stopped
 * and this is a PWA. Adding real native Android/iOS push later (FCM/APNs)
 * means writing a providers/fcmProvider.js / providers/apnsProvider.js
 * against the same `{ isConfigured(), send(subscription, payloadString) }`
 * shape and registering it in PROVIDERS below — call sites (routes/push.js,
 * and ArrivalIQ's Phase 2 scheduled sends) never need to change.
 */

const PushSubscription = require("../../models/PushSubscription");
const webPushProvider = require("./providers/webPushProvider");

const PROVIDERS = {
  webpush: webPushProvider,
  // fcm-android: require("./providers/fcmProvider"),
  // apns-ios:    require("./providers/apnsProvider"),
};

function isConfigured() {
  return Object.values(PROVIDERS).some((p) => p.isConfigured());
}

/**
 * Send a push payload to every subscription a user has registered (one per
 * device/browser they've granted notification permission on). Expired/
 * invalid subscriptions (410/404) are removed automatically. Fire-and-
 * forget: never throws.
 *
 * @param {ObjectId|string} userId
 * @param {Object} payload — { title, body, url?, tag? }
 */
async function sendToUser(userId, payload) {
  const subs = await PushSubscription.find({ user: userId }).lean();
  if (!subs.length) return { sent: 0, skipped: false };

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    const provider = PROVIDERS[sub.provider || "webpush"];
    if (!provider || !provider.isConfigured()) return;
    try {
      await provider.send(sub, body);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired or was revoked on the client — clean it up.
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      } else {
        console.error(`[Push] send failed for user ${userId} via ${sub.provider || "webpush"}:`, err.message);
      }
    }
  }));
  return { sent, skipped: sent === 0 && !isConfigured() };
}

module.exports = { sendToUser, isConfigured };
