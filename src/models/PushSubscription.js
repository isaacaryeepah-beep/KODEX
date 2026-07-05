"use strict";

/**
 * PushSubscription
 *
 * A single device's push registration for a user, as returned by
 * `PushManager.subscribe()` (Web Push) today, or a native FCM/APNs
 * registration token in a future phase. A user can have several (one per
 * device/browser they've granted notification permission on).
 *
 * `provider` selects which transport src/services/push/pushService.js uses
 * to deliver to this subscription — see providers/webPushProvider.js for
 * the only one implemented so far. `endpoint`/`keys` are Web Push-specific;
 * `deviceToken` is reserved for a future native provider.
 *
 * Written by `POST /api/push/subscribe`.
 */

const mongoose = require("mongoose");

const PROVIDERS = ["webpush", "fcm-android", "apns-ios"];

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
    // Reserved for a future native provider (FCM/APNs registration token).
    deviceToken: {
      type: String,
      default: null,
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
