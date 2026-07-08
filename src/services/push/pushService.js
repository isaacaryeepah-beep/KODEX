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
const Company = require("../../models/Company");
const webPushProvider = require("./providers/webPushProvider");
const fcmProvider = require("./providers/fcmProvider");

// Per-company branding for notifications, so pushes arrive titled/iconed as
// the employer ("Acme Ltd" + their logo) rather than as Dikly. Cached for a
// few minutes — branding changes rarely and sends can be bursty (sweep job).
const BRANDING_TTL_MS = 5 * 60 * 1000;
const _brandingCache = new Map(); // companyId → { at, name, logoUrl }
async function companyBranding(companyId) {
  if (!companyId) return null;
  const key = String(companyId);
  const hit = _brandingCache.get(key);
  if (hit && Date.now() - hit.at < BRANDING_TTL_MS) return hit;
  const company = await Company.findById(companyId).select("name branding.logoUrl").lean().catch(() => null);
  const entry = { at: Date.now(), name: company?.name || null, logoUrl: company?.branding?.logoUrl || null };
  _brandingCache.set(key, entry);
  return entry;
}

const PROVIDERS = {
  webpush: webPushProvider,
  "fcm-desktop": fcmProvider,
  "fcm-android": fcmProvider,
  // apns-ios: require("./providers/apnsProvider"),
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

  // Brand the notification as the user's organization: their logo as the
  // notification icon, and their company name as the title when the caller
  // didn't set one. Explicit titles/icons from callers always win.
  const brand = await companyBranding(subs[0].company);
  if (brand) {
    if (!payload.title && brand.name) payload = { ...payload, title: brand.name };
    if (!payload.icon && brand.logoUrl) payload = { ...payload, icon: brand.logoUrl };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (sub) => {
    const provider = PROVIDERS[sub.provider || "webpush"];
    if (!provider || !provider.isConfigured()) return;
    try {
      await provider.send(sub, body);
      sent++;
    } catch (err) {
      // Any 4xx means the push service itself rejected this subscription —
      // gone (404/410), or permanently invalid (400/403, e.g. a subscription
      // whose applicationServerKey no longer matches our current VAPID key
      // after a rotation). None of these will ever succeed on retry, so
      // clean them up the same way; only 5xx/network errors are transient.
      if (err.statusCode >= 400 && err.statusCode < 500) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        console.warn(`[Push] removed dead subscription for user ${userId} via ${sub.provider || "webpush"} (${err.statusCode}): ${err.body || err.message}`);
      } else {
        console.error(`[Push] send failed for user ${userId} via ${sub.provider || "webpush"} (status ${err.statusCode || "n/a"}):`, err.body || err.message);
      }
    }
  }));
  return { sent, skipped: sent === 0 && !isConfigured() };
}

module.exports = { sendToUser, isConfigured, clearBrandingCache: (companyId) => _brandingCache.delete(String(companyId)) };
