"use strict";

/**
 * push.js
 * Mounted at: /api/push   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /vapid-public-key   the public VAPID key the client needs for
 *                            pushManager.subscribe({ applicationServerKey })
 * GET    /fcm-sender-id      the Firebase messagingSenderId the Electron
 *                            desktop app needs to register with FCM
 * POST   /subscribe          register/refresh a push subscription — either
 *                            a browser's { endpoint, keys } (Web Push) or a
 *                            native client's { provider, deviceToken } (FCM)
 * DELETE /subscribe          unregister a subscription (endpoint or
 *                            deviceToken in body)
 * POST   /test               send a one-off test push to the caller
 *
 * Generic push-subscription plumbing — not specific to any one feature.
 * ArrivalIQ (and any future push-based feature) sends through
 * pushService.sendToUser(), which dispatches to whichever provider
 * (webpush, fcm-desktop, ...) each subscription is for.
 */

const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const PushSubscription = require("../models/PushSubscription");
const pushService = require("../services/push/pushService");

router.get("/vapid-public-key", authenticate, (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push notifications are not configured" });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// The Electron desktop app needs this to call electron-push-receiver's
// registration (it mimics an Android GCM/FCM client checkin, keyed by
// Firebase's numeric messagingSenderId — not secret, but kept server-side
// and admin-configurable rather than hardcoded into the shipped binary).
router.get("/fcm-sender-id", authenticate, (req, res) => {
  if (!process.env.FIREBASE_SENDER_ID) {
    return res.status(503).json({ error: "FCM is not configured" });
  }
  res.json({ senderId: process.env.FIREBASE_SENDER_ID });
});

router.post("/subscribe", authenticate, async (req, res) => {
  try {
    const { provider, endpoint, keys, deviceToken } = req.body || {};

    if (provider === "fcm-desktop" || provider === "fcm-android") {
      if (!deviceToken) return res.status(400).json({ error: "deviceToken is required" });
      await PushSubscription.findOneAndUpdate(
        { deviceToken },
        {
          user: req.user._id,
          company: req.user.company,
          provider,
          deviceToken,
          userAgent: (req.headers["user-agent"] || "").slice(0, 300),
          lastSeenAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return res.json({ ok: true });
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "endpoint and keys.{p256dh,auth} are required" });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user._id,
        company: req.user.company,
        provider: "webpush",
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: (req.headers["user-agent"] || "").slice(0, 300),
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.delete("/subscribe", authenticate, async (req, res) => {
  try {
    const { endpoint, deviceToken } = req.body || {};
    if (!endpoint && !deviceToken) {
      return res.status(400).json({ error: "endpoint or deviceToken is required" });
    }
    await PushSubscription.deleteOne({
      user: req.user._id,
      ...(endpoint ? { endpoint } : { deviceToken }),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

router.post("/test", authenticate, async (req, res) => {
  try {
    if (!pushService.isConfigured()) {
      return res.status(503).json({ error: "Push notifications are not configured" });
    }
    // No title on purpose — pushService fills in the user's company name
    // (and logo as the icon), so the test arrives branded like real sends.
    const result = await pushService.sendToUser(req.user._id, {
      body: "Push notifications are set up correctly.",
      tag: "push-test",
    });
    if (result.sent === 0) {
      return res.status(404).json({ error: "No active push subscription found for this device" });
    }
    res.json({ ok: true, sent: result.sent });
  } catch (error) {
    console.error("Push test error:", error);
    res.status(500).json({ error: "Failed to send test push" });
  }
});

module.exports = router;
