"use strict";

/**
 * ussd.js
 * Mounted at: /api/ussd   (registered in server.js)
 *
 * POST /callback   the URL registered with the USSD aggregator (Arkesel).
 *
 * Not JWT-authenticated — the aggregator can't carry a bearer token, so
 * this is a shared-secret webhook instead, same pattern as
 * scripts/deploy-webhook.js: a token configured out-of-band (in the
 * aggregator's dashboard, as part of the callback URL query string) and
 * compared with crypto.timingSafeEqual to avoid a timing side-channel.
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { handleUssdCallback } = require("../controllers/ussdController");

const USSD_WEBHOOK_TOKEN = process.env.USSD_WEBHOOK_TOKEN;

function verifyToken(req, res, next) {
  if (!USSD_WEBHOOK_TOKEN) {
    console.error("[USSD] USSD_WEBHOOK_TOKEN is not configured -- refusing all callbacks");
    res.type("text/plain");
    return res.status(503).send("END Service unavailable");
  }
  const provided = Buffer.from(String(req.query.token || ""));
  const expected = Buffer.from(USSD_WEBHOOK_TOKEN);
  const match = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!match) {
    res.type("text/plain");
    return res.status(401).send("END Unauthorized");
  }
  next();
}

// Most USSD aggregators, including Arkesel, POST form-encoded bodies for
// this kind of webhook; scoped here rather than mounted globally in
// server.js since nothing else in the app needs it.
router.post("/callback", express.urlencoded({ extended: true }), verifyToken, handleUssdCallback);

module.exports = router;
