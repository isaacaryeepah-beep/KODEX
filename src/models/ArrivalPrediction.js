"use strict";

/**
 * ArrivalPrediction
 *
 * One document per employee per calendar day (company-local date) — the
 * day's computed departure-time recommendation and delivery state. Written
 * by the sweep job (src/services/arrivalIQScheduler.js); read by the
 * employee's ArrivalIQ page, and later by the manager's live arrival
 * dashboard and punctuality analytics (Phase 3/4).
 *
 * Deliberately NOT a location history table — it stores the *outcome* of
 * a travel-time calculation (durations, a recommended clock, notification
 * timestamps), never a trail of raw coordinates.
 */

const mongoose = require("mongoose");

const arrivalPredictionSchema = new mongoose.Schema(
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
    // Company-local "YYYY-MM-DD" — one prediction per employee per day.
    date: {
      type: String,
      required: true,
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      default: null,
    },
    shiftStartTime: {
      type: String, // "HH:MM"
      required: true,
    },
    travelMinutes: { type: Number, default: null },
    travelMinutesInTraffic: { type: Number, default: null },
    distanceMeters: { type: Number, default: null },
    trafficLevel: {
      type: String,
      enum: ["light", "moderate", "heavy", null],
      default: null,
    },
    recommendedDepartureAt: { type: Date, default: null },
    estimatedArrivalAt: { type: Date, default: null },

    // Delivery bookkeeping — prevents the sweep job (which may run every
    // few minutes) from sending the same notification twice.
    departureNotifiedAt: { type: Date, default: null },
    lateRiskNotifiedAt: { type: Date, default: null },
    // Fired once, the first sweep that finds this employee's shift inside
    // the lookahead window with no fresh location yet — a "open Dikly so we
    // can plan your commute" nudge. Without it, an employee who never opens
    // the app before their shift gets no reminder at all (nothing to
    // compute a departure time from) and the miss is silent.
    checkInPromptedAt: { type: Date, default: null },

    // pending: not enough data yet (no fresh location, or not computed).
    status: {
      type: String,
      enum: ["pending", "on_time", "at_risk", "likely_late"],
      default: "pending",
    },

    // Why a prediction couldn't be computed, surfaced to the employee
    // instead of silently doing nothing (e.g. "no_recent_location").
    skipReason: { type: String, default: null },
  },
  { timestamps: true }
);

arrivalPredictionSchema.index({ company: 1, user: 1, date: 1 }, { unique: true });
arrivalPredictionSchema.index({ company: 1, date: 1, status: 1 });

module.exports = mongoose.model("ArrivalPrediction", arrivalPredictionSchema);
