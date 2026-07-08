"use strict";

/**
 * PushSubscription
 *
 * A single device's push registration for a user, as returned by
 * `PushManager.subscribe()` (Web Push, provider: "webpush") or a native FCM
 * registration token (provider: "fcm-desktop" — the Electron app, via
 * electron-push-receiver; "fcm-android" reserved for a future native
 * Android client). A user can have several (one per device/browser/app
 * they've granted notification permission on).
 *
 * `provider` selects which transport src/services/push/pushService.js uses
 * to deliver to this subscription — see providers/webPushProvider.js and
 * providers/fcmProvider.js. `endpoint`/`keys` are Web Push-specific;
 * `deviceToken` is the FCM registration token for the fcm-* providers.
 *
 * Written by `POST /api/push/subscribe`.
 */

const mongoose = require("mongoose");

const PROVIDERS = ["webpush", "fcm-desktop", "fcm-android", "apns-ios"];
const FCM_PROVIDERS = ["fcm-desktop", "fcm-android"];

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: PROVIDERS,
      default: "webpush",
    },
    // Web Push (provider: "webpush")
    endpoint: {
      type: String,
      required: function () { return this.provider === "webpush"; },
      unique: true,
      sparse: true,
    },
    keys: {
      p256dh: { type: String },
      auth:   { type: String },
    },
    // FCM registration token (provider: "fcm-desktop" / "fcm-android").
    deviceToken: {
      type: String,
      required: function () { return FCM_PROVIDERS.includes(this.provider); },
      unique: true,
      sparse: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
module.exports.PROVIDERS = PROVIDERS;
