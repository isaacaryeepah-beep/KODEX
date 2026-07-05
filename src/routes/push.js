"use strict";

/**
 * push.js
 * Mounted at: /api/push   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /vapid-public-key   the public VAPID key the client needs for
 *                            pushManager.subscribe({ applicationServerKey })
 * POST   /subscribe          register/refresh a browser's push subscription
 * DELETE /subscribe          unregister a subscription (endpoint in body)
 * POST   /test               send a one-off test push to the caller
 *
 * Generic push-subscription plumbing — not specific to any one feature.
 * ArrivalIQ (and any future push-based feature) sends through
 * pushService.sendToUser(), which dispatches to whichever provider
 * (webpush today; native FCM/APNs later) each subscription is for.
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

router.post("/subscribe", authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "endpoint and keys.{p256dh,auth} are required" });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user._id,
        company: req.user.company,
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
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
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
    const result = await pushService.sendToUser(req.user._id, {
      title: "Dikly",
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
