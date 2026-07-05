"use strict";

/**
 * PushSubscription
 *
 * A single browser/device Web Push endpoint for a user, as returned by
 * `PushManager.subscribe()` on the client. A user can have several (one per
 * device/browser they've granted notification permission on).
 *
 * Written by `POST /api/push/subscribe`, consumed by `webPushService.js`
 * when sending a real push (ArrivalIQ and any future push-based feature).
 */

const mongoose = require("mongoose");

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
    endpoint: {
      type: String,
      required: true,
      unique: true,
    },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
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
