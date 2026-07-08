"use strict";

/**
 * LiveTrackingSession
 *
 * One document per live commute trip — created when an employee taps
 * "Start Live Trip" on the ArrivalIQ page, closed when they arrive or end
 * it manually. Requires its own explicit consent
 * (user.arrivalIQConsent.liveTrackingGranted) separate from ArrivalIQ's
 * regular location consent, which explicitly promises location is "never
 * tracked continuously" — a live trip genuinely is continuous tracking for
 * its duration, so it needs its own opt-in.
 *
 * `routeCoordinates` is the planned road path fetched once at trip start
 * (not personal data — it's the route geometry, same shape for anyone
 * travelling that road). `lastPosition` is the employee's live GPS fix and
 * is overwritten on every ping, never appended to a history array — same
 * no-trail stance as ArrivalPrediction.
 */

const mongoose = require("mongoose");

const pointSchema = new mongoose.Schema(
  { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  { _id: false }
);

const liveTrackingSessionSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      index: true,
    },
    origin: { type: pointSchema, required: true },
    destination: { type: pointSchema, required: true },
    // The planned road path, fetched once from TomTom at trip start.
    routeCoordinates: { type: [pointSchema], default: [] },
    distanceMeters: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },

    // Overwritten on every ping — never a trail.
    lastPosition: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      capturedAt: { type: Date, default: null },
    },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: ["arrived", "manual", null],
      default: null,
    },
  },
  { timestamps: true }
);

liveTrackingSessionSchema.index({ company: 1, user: 1, status: 1 });

module.exports = mongoose.model("LiveTrackingSession", liveTrackingSessionSchema);
